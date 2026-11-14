import { plainName } from '../../model/rules';
import { sniffMedia } from '../../storage/import';
import { NOTICES, type Notice } from '../recorder/messages';
import { recordingFileName } from '../recorder/names';
import type { Preview } from '../recorder/preview';
import { buildWaveform, framesToMs, minSaveFrames, msToFrames } from '../recorder/rules';
import type { RecordedFile, SaveResult } from '../recorder/session';
import { pcm16ToFloat, renderPcm16, renderWav } from '../recorder/wav';
import type { DecodedSound } from './decode';
import { CLIP_NOTICES, CLIP_PROBLEMS, longFileNotice, type ClipProblem } from './messages';
import {
  DEFAULT_CLIP_NAME,
  MAX_SOURCE_BYTES,
  MAX_SOURCE_MS,
  STARTING_CLIP_SECONDS,
  canZoomFile,
  clipNameFromFile,
  maxSourceFrames,
  moveEnd,
  moveStart,
  startingSelection,
  zoomWindow,
  type StartingSelection,
} from './rules';

/**
 * Clipping a sound out of a video or a long sound file, from start to finish: open the file, show it with a part
 * already picked, let her move Start and End (and zoom in to place them exactly), then save that part as a new sound.
 * Nothing is saved until she presses Save. It is modelled on the recorder's session, and like it holds no screen code,
 * so the whole thing runs (and is tested) without a browser.
 */

export type ClipPhase = 'choose' | 'loading' | 'review' | 'saving' | 'done';

export interface ClipState {
  phase: ClipPhase;
  /** The name of the file that is being opened or clipped. */
  fileName: string;
  /** The file itself, so a player can show it. Null until one is open. */
  source: Blob | null;
  /** Why the last file couldn't be opened. Shown on the first screen, where she can choose another. */
  problem: string | null;
  /** The whole file, in milliseconds. */
  lengthMs: number;
  /** The part of the file the picture shows: all of it, unless she has zoomed in. */
  viewStartMs: number;
  viewEndMs: number;
  zoomed: boolean;
  /** Whether zooming in (or back out) would change the picture. */
  canZoom: boolean;
  /** The part that is kept, from Start to End, as places in the whole file. */
  startMs: number;
  endMs: number;
  keptMs: number;
  /** The picture of what is shown: how loud each of its 240 parts is, 0 to 1. */
  bars: readonly number[];
  previewing: boolean;
  name: string;
  notice: Notice | null;
}

export interface ClipDeps {
  /** How long a file is in milliseconds, or null when that can't be told. */
  probe: (file: Blob) => Promise<number | null>;
  /** Opens a file and gives back one channel of its sound. Throws when the sound can't be got out of it. */
  decode: (bytes: ArrayBuffer) => Promise<DecodedSound>;
  createPreview: () => Preview;
  /** Turns the clip into a sound. Says why when it can't (the message is shown to her as it is). */
  save: (file: RecordedFile) => Promise<SaveResult>;
}

const INITIAL: ClipState = {
  phase: 'choose',
  fileName: '',
  source: null,
  problem: null,
  lengthMs: 0,
  viewStartMs: 0,
  viewEndMs: 0,
  zoomed: false,
  canZoom: false,
  startMs: 0,
  endMs: 0,
  keptMs: 0,
  bars: [],
  previewing: false,
  name: DEFAULT_CLIP_NAME,
  notice: null,
};

/** How much of the start of a file is looked at to tell what kind of file it is. */
const SNIFF_BYTES = 64 * 1024;

type Outcome = ClipProblem | 'stale' | null;

type ViewFields = Pick<
  ClipState,
  'lengthMs' | 'viewStartMs' | 'viewEndMs' | 'zoomed' | 'canZoom' | 'startMs' | 'endMs' | 'keptMs'
>;

export class ClipSession {
  private readonly deps: ClipDeps;
  private readonly listeners = new Set<() => void>();
  private current: ClipState = INITIAL;

  private loadToken = 0;
  private samples: Float32Array = new Float32Array(0);
  private rate = 0;
  private startFrame = 0;
  private endFrame = 0;
  private viewFrom = 0;
  private viewTo = 0;
  private zoomed = false;

  private preview: Preview | null = null;
  private previewToken = 0;
  private disposed = false;

  constructor(deps: ClipDeps) {
    this.deps = deps;
  }

  // The screen follows the clipper through these two (they suit React's useSyncExternalStore).
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly getState = (): ClipState => this.current;

  /**
   * Opens a file. From the first screen, or from the review when she picks another file. If it can't be opened she
   * is back at the first screen, told why.
   */
  async load(file: Blob, fileName: string): Promise<void> {
    const { phase } = this.current;
    if (this.disposed || (phase !== 'choose' && phase !== 'review')) return;
    this.stopPreview();
    const token = ++this.loadToken;
    this.forget();
    this.update({ ...INITIAL, phase: 'loading', fileName });

    const outcome = await this.open(file, fileName, token);
    if (outcome === 'stale') return;
    if (outcome !== null) this.update({ ...INITIAL, problem: CLIP_PROBLEMS[outcome] });
  }

  /** "Cancel" while a file is opening: back to the first screen. */
  cancel(): void {
    if (this.current.phase !== 'loading') return;
    this.loadToken += 1;
    this.update({ ...INITIAL });
  }

  /** Moves the Start handle. It can't pass End (less the shortest clip that can be saved) and the clip can't be too long. */
  setStart(ms: number): void {
    if (!this.inReview()) return;
    const moved = moveStart(ms, this.rate, this.endFrame);
    this.startFrame = moved.frame;
    this.moved(moved.limited);
  }

  /** Moves the End handle. It can't come closer to Start than the shortest clip that can be saved, and the clip can't be too long. */
  setEnd(ms: number): void {
    if (!this.inReview()) return;
    const moved = moveEnd(ms, this.rate, this.startFrame, this.samples.length);
    this.endFrame = moved.frame;
    this.moved(moved.limited);
  }

  /**
   * "Start here", pressed while the file plays. Start goes to that moment. When that is after End, End follows a
   * few seconds on, rather than holding Start back, so she can press Start here first and End here after.
   */
  startHere(ms: number): void {
    if (!this.inReview()) return;
    const total = this.samples.length;
    const least = minSaveFrames(this.rate);
    if (msToFrames(ms, this.rate) <= this.endFrame - least) {
      this.setStart(ms);
      return;
    }
    this.startFrame = Math.min(msToFrames(ms, this.rate), Math.max(0, total - least));
    this.endFrame = Math.min(total, this.startFrame + this.followFrames());
    this.moved(false);
  }

  /** "End here", pressed while the file plays. When that is before Start, Start follows a few seconds back. */
  endHere(ms: number): void {
    if (!this.inReview()) return;
    const total = this.samples.length;
    const least = minSaveFrames(this.rate);
    const wanted = ms >= framesToMs(total, this.rate) ? total : msToFrames(ms, this.rate);
    if (wanted >= this.startFrame + least) {
      this.setEnd(ms);
      return;
    }
    this.endFrame = Math.max(wanted, least);
    this.startFrame = Math.max(0, this.endFrame - this.followFrames());
    this.moved(false);
  }

  setName(name: string): void {
    if (!this.inReview()) return;
    this.update({ name });
  }

  /** Shows just the part around the clip, big enough to place Start and End exactly. */
  zoomToSelection(): void {
    if (!this.inReview() || this.zoomed) return;
    const target = this.zoomTarget();
    if (!target) return;
    this.viewFrom = target.from;
    this.viewTo = target.to;
    this.zoomed = true;
    this.update({ ...this.view(), bars: this.bars() });
  }

  /** Shows the whole file again. */
  showWholeFile(): void {
    if (!this.inReview() || !this.zoomed) return;
    this.leaveZoom();
    this.update({ ...this.view(), bars: this.bars() });
  }

  /** Plays the part that is kept, or stops it. */
  togglePreview(): void {
    if (!this.inReview()) return;
    if (this.stopPreview()) return;

    // What is played is what will be saved: turned down if too loud, with the ends faded.
    const heard = pcm16ToFloat(renderPcm16(this.samples, this.rate, this.startFrame, this.endFrame));
    const token = ++this.previewToken;
    this.update({ previewing: true });
    this.preview ??= this.deps.createPreview();
    const started = this.preview.play(heard, this.rate, () => {
      if (token === this.previewToken) this.update({ previewing: false });
    });
    if (!started && token === this.previewToken) this.update({ previewing: false, notice: CLIP_NOTICES.previewFailed });
  }

  /** Stops the preview if it is playing (the screen does this when the file's own player starts). True if it was. */
  stopPreview(): boolean {
    if (!this.current.previewing) return false;
    // The preview says it has ended as it stops. That is already known here.
    this.previewToken += 1;
    this.preview?.stop();
    this.update({ previewing: false });
    return true;
  }

  /** Saves the part that is kept as a sound. If that doesn't work she goes back to the review, and nothing is lost. */
  async save(): Promise<void> {
    if (!this.inReview()) return;
    this.stopPreview();
    this.update({ phase: 'saving', notice: null });

    let result: SaveResult;
    try {
      result = await this.deps.save(this.file());
    } catch {
      result = { ok: false };
    }
    if (this.disposed) return;
    if (result.ok) {
      this.update({ phase: 'done' });
    } else {
      this.update({ phase: 'review', notice: { kind: 'problem', text: result.message ?? CLIP_NOTICES.saveFailed.text } });
    }
  }

  /** The part that is kept, as a file she can keep for herself. Null when no clip is open. */
  renderFile(): RecordedFile | null {
    return this.inReview() ? this.file() : null;
  }

  /** She wants to close the clipper. True means go ahead; false means a save is under way. */
  requestClose(): boolean {
    return this.current.phase !== 'saving';
  }

  /** Lets go of the file and everything else. Call this when the clipper closes. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadToken += 1;
    this.previewToken += 1;
    this.preview?.stop();
    this.forget();
    this.listeners.clear();
  }

  /** Reads the file and gets its sound. Gives the reason when it can't be done, 'stale' when she moved on meanwhile. */
  private async open(file: Blob, fileName: string, token: number): Promise<Outcome> {
    const stale = (): boolean => this.disposed || token !== this.loadToken;
    const failed = (problem: ClipProblem): Outcome => (stale() ? 'stale' : problem);

    if (file.size === 0) return 'empty';
    if (file.size > MAX_SOURCE_BYTES) return 'tooBig';

    let head: Uint8Array;
    try {
      head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    } catch {
      return failed('readFailed');
    }
    if (stale()) return 'stale';
    // A file nobody recognises is still tried: the browser may know more kinds of sound than this does.
    if (sniffMedia(head)?.kind === 'picture') return 'picture';

    let lengthMs: number | null = null;
    try {
      lengthMs = await this.deps.probe(file);
    } catch {
      // Not knowing the length is fine: it is checked again once the sound is open.
    }
    if (stale()) return 'stale';
    if (lengthMs !== null && lengthMs > MAX_SOURCE_MS) return 'tooLong';

    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch {
      return failed('readFailed');
    }
    if (stale()) return 'stale';

    let sound: DecodedSound;
    try {
      sound = await this.deps.decode(bytes);
    } catch {
      return failed('unreadable');
    }
    if (stale()) return 'stale';

    const { samples, rate } = sound;
    if (samples.length === 0) return 'unreadable';
    if (samples.length > maxSourceFrames(rate)) return 'tooLong';
    if (samples.length < minSaveFrames(rate)) return 'tooShort';
    const selection = startingSelection(samples, rate);
    if (!selection) return 'silent';

    this.enterReview(file, fileName, sound, selection);
    return null;
  }

  private enterReview(file: Blob, fileName: string, sound: DecodedSound, selection: StartingSelection): void {
    this.samples = sound.samples;
    this.rate = sound.rate;
    this.startFrame = selection.start;
    this.endFrame = selection.end;
    this.viewFrom = 0;
    this.viewTo = sound.samples.length;
    this.zoomed = false;

    const total = sound.samples.length;
    let notice: Notice | null = null;
    if (selection.long) notice = longFileNotice(framesToMs(total, this.rate));
    else if (selection.start > 0 || selection.end < total) notice = NOTICES.trimmed;

    this.update({
      ...INITIAL,
      phase: 'review',
      fileName,
      source: file,
      name: clipNameFromFile(fileName),
      notice,
      ...this.view(),
      bars: this.bars(),
    });
  }

  /** Lets go of the sound that was open. */
  private forget(): void {
    this.samples = new Float32Array(0);
    this.rate = 0;
    this.startFrame = 0;
    this.endFrame = 0;
    this.viewFrom = 0;
    this.viewTo = 0;
    this.zoomed = false;
  }

  /** What the picture and the Start and End handles say about the file. */
  private view(): ViewFields {
    return {
      lengthMs: framesToMs(this.samples.length, this.rate),
      viewStartMs: framesToMs(this.viewFrom, this.rate),
      viewEndMs: framesToMs(this.viewTo, this.rate),
      zoomed: this.zoomed,
      canZoom: this.zoomed || this.zoomTarget() !== null,
      startMs: framesToMs(this.startFrame, this.rate),
      endMs: framesToMs(this.endFrame, this.rate),
      keptMs: framesToMs(this.endFrame - this.startFrame, this.rate),
    };
  }

  /** The bars for what the picture shows. */
  private bars(): readonly number[] {
    return buildWaveform(this.samples.subarray(this.viewFrom, this.viewTo));
  }

  /** The part a zoomed-in picture would show, or null when that would not be less than the whole file. */
  private zoomTarget(): { from: number; to: number } | null {
    const total = this.samples.length;
    if (!canZoomFile(total, this.rate)) return null;
    const target = zoomWindow(this.startFrame, this.endFrame, total, this.rate);
    return target.from <= 0 && target.to >= total ? null : target;
  }

  private leaveZoom(): void {
    this.zoomed = false;
    this.viewFrom = 0;
    this.viewTo = this.samples.length;
  }

  /** How far a handle follows the other when it is placed past it: a few seconds, like the clip she starts with. */
  private followFrames(): number {
    return Math.max(minSaveFrames(this.rate), Math.floor(STARTING_CLIP_SECONDS * this.rate));
  }

  /** Whether a clip is open to look at and change. It is not once the clipper has closed. */
  private inReview(): boolean {
    return !this.disposed && this.current.phase === 'review';
  }

  /**
   * A handle moved. What was playing no longer matches. A zoomed-in picture has to hold the whole clip, so when a
   * handle went outside it the whole file comes back. `limited` says the longest clip held the handle back.
   */
  private moved(limited: boolean): void {
    this.stopPreview();
    let bars: readonly number[] | undefined;
    if (this.zoomed && (this.startFrame < this.viewFrom || this.endFrame > this.viewTo)) {
      this.leaveZoom();
      bars = this.bars();
    }
    this.update({ ...this.view(), ...(bars ? { bars } : {}), notice: limited ? CLIP_NOTICES.longest : null });
  }

  private file(): RecordedFile {
    const typed = this.current.name;
    return {
      bytes: renderWav(this.samples, this.rate, this.startFrame, this.endFrame),
      fileName: recordingFileName(typed, DEFAULT_CLIP_NAME),
      name: plainName(typed, DEFAULT_CLIP_NAME),
    };
  }

  private update(patch: Partial<ClipState>): void {
    if (this.disposed) return;
    this.current = { ...this.current, ...patch };
    for (const listener of [...this.listeners]) listener();
  }
}
