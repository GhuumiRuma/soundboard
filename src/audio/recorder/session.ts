import { plainName } from '../../model/rules';
import { MIC_PROBLEM_TEXT, NOTICES, canRetryMic, micProblemKind, type Notice } from './messages';
import type { MicInput, OpenMic } from './mic';
import { DEFAULT_RECORDING_NAME, recordingFileName } from './names';
import type { Preview } from './preview';
import {
  CONFIRM_AFTER_MS,
  TRIM_THRESHOLD,
  buildWaveform,
  endFrameFor,
  fallBack,
  framesToMs,
  levelPercent,
  maxRecordingFrames,
  minSaveFrames,
  peakOf,
  startFrameFor,
  suggestTrim,
} from './rules';
import { pcm16ToFloat, renderPcm16, renderWav } from './wav';

/**
 * Recording a sound from start to finish, as StreamStudio's recorder does it: get the microphone ready, record,
 * review (the quiet at the start and end is cut for her, and she can drag Start and End), then save. Nothing is
 * saved until she presses Save. This holds no screen code, so the whole thing runs (and is tested) without a browser.
 */

export type RecorderPhase = 'ready' | 'recording' | 'review' | 'saving' | 'done';

export type MicStatus =
  | { status: 'opening' }
  | { status: 'open'; label: string }
  | { status: 'problem'; text: string; canRetry: boolean };

/** A question waiting for her answer: really close the recorder, or really start over? */
export type Confirm = 'close' | 'recordAgain';

export interface RecorderState {
  phase: RecorderPhase;
  mic: MicStatus;
  /** How loud the microphone is right now, 0 to 100. */
  level: number;
  /** How long the recording is so far, in whole seconds (that is all the clock shows). */
  elapsedMs: number;
  /** The whole recording, and the part that is kept (from Start to End), in milliseconds. */
  lengthMs: number;
  startMs: number;
  endMs: number;
  keptMs: number;
  /** The picture of the recording: how loud each of its 240 parts is, 0 to 1. */
  bars: readonly number[];
  /** Whether anything at the start or end is cut off. */
  trimmed: boolean;
  /** Whether nothing was heard at all. */
  silent: boolean;
  canSave: boolean;
  previewing: boolean;
  name: string;
  notice: Notice | null;
  confirm: Confirm | null;
}

/** A finished recording, ready to become a sound. */
export interface RecordedFile {
  /** The WAV file. */
  bytes: ArrayBuffer;
  /** "My recording.wav" */
  fileName: string;
  /** What the sound is called on the board. */
  name: string;
}

export type SaveResult = { ok: true } | { ok: false; message?: string };

export interface RecorderDeps {
  openMic: OpenMic;
  createPreview: () => Preview;
  /** Turns the recording into a sound. Says why when it can't (the message is shown to her as it is). */
  save: (file: RecordedFile) => Promise<SaveResult>;
}

const INITIAL: RecorderState = {
  phase: 'ready',
  mic: { status: 'opening' },
  level: 0,
  elapsedMs: 0,
  lengthMs: 0,
  startMs: 0,
  endMs: 0,
  keptMs: 0,
  bars: [],
  trimmed: false,
  silent: false,
  canSave: false,
  previewing: false,
  name: DEFAULT_RECORDING_NAME,
  notice: null,
  confirm: null,
};

type ReviewReason = 'stoppedAtLimit' | 'deviceLost' | null;

export class RecorderSession {
  private readonly deps: RecorderDeps;
  private readonly listeners = new Set<() => void>();
  private current: RecorderState = INITIAL;

  private mic: MicInput | null = null;
  private opening = false;
  private rate = 0;
  private limit = 0;

  private chunks: Float32Array[] = [];
  private frames = 0;
  private peak = 0;
  private hitLimit = false;
  private finishing = false;

  private samples: Float32Array = new Float32Array(0);
  private silent = false;
  private startFrame = 0;
  private endFrame = 0;

  private preview: Preview | null = null;
  private previewToken = 0;
  private disposed = false;

  constructor(deps: RecorderDeps) {
    this.deps = deps;
  }

  // The screen follows the recorder through these two (they suit React's useSyncExternalStore).
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly getState = (): RecorderState => this.current;

  /** Gets the microphone ready. Safe to call again: it does nothing while it is open or opening. */
  async open(): Promise<void> {
    if (this.disposed || this.mic || this.opening) return;
    this.opening = true;
    this.update({ mic: { status: 'opening' } });
    try {
      const mic = await this.deps.openMic();
      if (this.disposed) {
        mic.close();
        return;
      }
      this.attach(mic);
    } catch (error) {
      if (this.disposed) return;
      const kind = micProblemKind(error);
      this.update({ mic: { status: 'problem', text: MIC_PROBLEM_TEXT[kind], canRetry: canRetryMic(kind) } });
    } finally {
      this.opening = false;
    }
  }

  /** "Try again" after the microphone couldn't be opened. */
  async retry(): Promise<void> {
    const { phase, mic } = this.current;
    if (phase !== 'ready' || mic.status !== 'problem' || !mic.canRetry) return;
    await this.open();
  }

  /** Starts recording. */
  record(): void {
    const { phase, confirm } = this.current;
    if (phase !== 'ready' || confirm !== null || !this.mic) return;
    this.chunks = [];
    this.frames = 0;
    this.hitLimit = false;
    this.finishing = false;
    this.update({ phase: 'recording', elapsedMs: 0, notice: null });
  }

  /** Stops recording and shows what was recorded. */
  async stop(): Promise<void> {
    const { phase, confirm } = this.current;
    if (phase !== 'recording' || confirm !== null) return;
    await this.finish(true, null);
  }

  /**
   * Called about 20 times a second while the recorder is open, with how many seconds have passed. It lets the level
   * meter fall back after a loud moment and moves the clock on.
   */
  tick(seconds: number): void {
    const { phase } = this.current;
    if (phase !== 'ready' && phase !== 'recording') return;
    // The meter shows the loudest moment since the last tick, and only then starts falling back.
    const level = levelPercent(this.peak);
    this.peak = fallBack(this.peak, seconds);
    const elapsedMs = Math.floor(framesToMs(this.frames, this.rate) / 1000) * 1000;
    if (level !== this.current.level || elapsedMs !== this.current.elapsedMs) this.update({ level, elapsedMs });
  }

  /** Moves the Start handle. It can't pass End (less the shortest clip that can be saved). */
  setStart(ms: number): void {
    if (!this.canEdit()) return;
    this.startFrame = startFrameFor(ms, this.rate, this.endFrame);
    this.moved();
  }

  /** Moves the End handle. It can't come closer to Start than the shortest clip that can be saved. */
  setEnd(ms: number): void {
    if (!this.canEdit()) return;
    this.endFrame = endFrameFor(ms, this.rate, this.startFrame, this.samples.length);
    this.moved();
  }

  setName(name: string): void {
    if (this.current.phase !== 'review') return;
    this.update({ name });
  }

  /** Plays the part that is kept, or stops it. */
  togglePreview(): void {
    const { phase, confirm, canSave } = this.current;
    if (phase !== 'review' || confirm !== null) return;
    if (this.stopPreview() || !canSave) return;

    // What is played is what will be saved: turned down if too loud, with the ends faded.
    const heard = pcm16ToFloat(renderPcm16(this.samples, this.rate, this.startFrame, this.endFrame));
    const token = ++this.previewToken;
    this.update({ previewing: true });
    this.preview ??= this.deps.createPreview();
    const started = this.preview.play(heard, this.rate, () => {
      if (token === this.previewToken) this.update({ previewing: false });
    });
    if (!started && token === this.previewToken) this.update({ previewing: false, notice: NOTICES.previewFailed });
  }

  /** Saves the part that is kept as a sound. If that doesn't work she goes back to the review, and nothing is lost. */
  async save(): Promise<void> {
    const { phase, canSave, confirm } = this.current;
    if (phase !== 'review' || !canSave || confirm !== null) return;
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
      this.update({ phase: 'review', notice: { kind: 'problem', text: result.message ?? NOTICES.saveFailed.text } });
    }
  }

  /** The part that is kept, as a file she can keep for herself. Null when there is nothing worth saving. */
  renderFile(): RecordedFile | null {
    const { phase, canSave } = this.current;
    return phase === 'review' && canSave ? this.file() : null;
  }

  /**
   * She wants to close the recorder. True means go ahead. False means don't close yet: either a recording of a
   * second or more would be lost (so she is asked first), or a save is under way.
   */
  requestClose(): boolean {
    const { phase, confirm } = this.current;
    if (phase === 'done') return true;
    if (phase === 'saving' || confirm !== null) return false;
    if (this.needsConfirm()) {
      this.update({ confirm: 'close' });
      return false;
    }
    return true;
  }

  /** She starts again with a fresh recording. Asks first when that would lose a recording of a second or more. */
  recordAgain(): void {
    const { phase, confirm } = this.current;
    if (phase !== 'review' || confirm !== null) return;
    if (this.needsConfirm()) this.update({ confirm: 'recordAgain' });
    else void this.startOver();
  }

  /** "Throw away": does what she was asked about. True means close the recorder. */
  throwAway(): boolean {
    const { confirm } = this.current;
    if (confirm === 'close') return true;
    if (confirm === 'recordAgain') void this.startOver();
    return false;
  }

  /** "Keep it" (or "Keep recording"): she changed her mind. */
  keepIt(): void {
    if (this.current.confirm !== null) this.update({ confirm: null });
  }

  /** Lets go of the microphone and everything else. Call this when the recorder closes. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.previewToken += 1;
    this.preview?.stop();
    this.mic?.close();
    this.mic = null;
    this.chunks = [];
    this.samples = new Float32Array(0);
    this.listeners.clear();
  }

  private attach(mic: MicInput): void {
    this.mic = mic;
    this.rate = mic.sampleRate;
    this.limit = maxRecordingFrames(mic.sampleRate);
    this.peak = 0;
    mic.onBlock = (block) => this.hear(block);
    mic.onLost = () => this.lost();
    this.update({ mic: { status: 'open', label: mic.label } });
  }

  /** A block of sound from the microphone. Before Record it only moves the level meter. */
  private hear(block: Float32Array): void {
    this.peak = Math.max(this.peak, peakOf(block));
    if (this.current.phase !== 'recording') return;
    const room = this.limit - this.frames;
    if (room <= 0) return;
    const part = block.length > room ? block.subarray(0, room) : block;
    this.chunks.push(part);
    this.frames += part.length;
    if (this.frames >= this.limit) {
      this.hitLimit = true;
      void this.finish(false, null);
    }
  }

  /** The microphone went away: it was unplugged, or another app took it. */
  private lost(): void {
    const { phase } = this.current;
    if (phase === 'recording') {
      void this.finish(false, 'deviceLost');
    } else if (phase === 'ready') {
      this.mic?.close();
      this.mic = null;
      this.update({ level: 0, mic: { status: 'problem', text: MIC_PROBLEM_TEXT.missing, canRetry: true } });
    }
  }

  private async finish(flush: boolean, why: ReviewReason): Promise<void> {
    if (this.finishing || this.current.phase !== 'recording') return;
    this.finishing = true;
    const mic = this.mic;
    if (flush && mic) {
      try {
        // The last part of what was said may still be on its way.
        await mic.flush();
      } catch {
        // What has arrived is what there is.
      }
    }
    if (this.disposed) return;
    this.mic = null;
    mic?.close();
    this.enterReview(this.hitLimit ? 'stoppedAtLimit' : why);
    this.finishing = false;
  }

  private enterReview(why: ReviewReason): void {
    const samples = new Float32Array(this.frames);
    let at = 0;
    for (const chunk of this.chunks) {
      samples.set(chunk, at);
      at += chunk.length;
    }
    this.chunks = [];
    this.samples = samples;

    this.silent = peakOf(samples) < TRIM_THRESHOLD;
    this.startFrame = 0;
    this.endFrame = samples.length;
    if (!this.silent) {
      const trim = suggestTrim(samples, this.rate);
      if (trim.found) {
        this.startFrame = trim.start;
        this.endFrame = trim.end;
      }
    }

    const view = this.view();
    let notice: Notice | null = null;
    if (this.silent) notice = NOTICES.silent;
    else if (samples.length < minSaveFrames(this.rate)) notice = NOTICES.tooShort;
    else if (why === 'stoppedAtLimit') notice = NOTICES.stoppedAtLimit;
    else if (why === 'deviceLost') notice = NOTICES.deviceLost;
    else if (view.trimmed) notice = NOTICES.trimmed;

    this.update({
      ...view,
      phase: 'review',
      level: 0,
      bars: buildWaveform(samples),
      silent: this.silent,
      previewing: false,
      name: DEFAULT_RECORDING_NAME,
      notice,
      confirm: null,
    });
  }

  private startOver(): Promise<void> {
    this.stopPreview();
    this.chunks = [];
    this.frames = 0;
    this.hitLimit = false;
    this.finishing = false;
    this.silent = false;
    this.samples = new Float32Array(0);
    this.startFrame = 0;
    this.endFrame = 0;
    this.update({ ...INITIAL });
    return this.open();
  }

  /** What the Start and End handles say about the recording. */
  private view(): Pick<RecorderState, 'lengthMs' | 'startMs' | 'endMs' | 'keptMs' | 'trimmed' | 'canSave'> {
    const total = this.samples.length;
    const kept = this.endFrame - this.startFrame;
    return {
      lengthMs: framesToMs(total, this.rate),
      startMs: framesToMs(this.startFrame, this.rate),
      endMs: framesToMs(this.endFrame, this.rate),
      keptMs: framesToMs(kept, this.rate),
      trimmed: this.startFrame > 0 || this.endFrame < total,
      canSave: !this.silent && kept >= minSaveFrames(this.rate),
    };
  }

  private canEdit(): boolean {
    return this.current.phase === 'review' && this.current.confirm === null;
  }

  /** A handle moved. What was playing no longer matches, and the "I cut the quiet" hint no longer applies. */
  private moved(): void {
    this.stopPreview();
    const { notice } = this.current;
    this.update({ ...this.view(), notice: notice === NOTICES.trimmed ? null : notice });
  }

  private stopPreview(): boolean {
    if (!this.current.previewing) return false;
    // The preview says it has ended as it stops. That is already known here.
    this.previewToken += 1;
    this.preview?.stop();
    this.update({ previewing: false });
    return true;
  }

  private file(): RecordedFile {
    const typed = this.current.name;
    return {
      bytes: renderWav(this.samples, this.rate, this.startFrame, this.endFrame),
      fileName: recordingFileName(typed),
      name: plainName(typed, DEFAULT_RECORDING_NAME),
    };
  }

  /** Whether closing, or starting over, would throw away something worth keeping (a second or more of sound). */
  private needsConfirm(): boolean {
    const { phase } = this.current;
    if (phase === 'recording') return framesToMs(this.frames, this.rate) >= CONFIRM_AFTER_MS;
    if (phase === 'review') return !this.silent && framesToMs(this.samples.length, this.rate) >= CONFIRM_AFTER_MS;
    return false;
  }

  private update(patch: Partial<RecorderState>): void {
    if (this.disposed) return;
    this.current = { ...this.current, ...patch };
    for (const listener of [...this.listeners]) listener();
  }
}
