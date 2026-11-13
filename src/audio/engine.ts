import { canPlayOgg } from '../lib/device';
import type { AudioExt } from '../storage/import';
import { DecodedCache } from './cache';
import { setAudioSession } from './session';
import { gainFor } from './volume';

/** How long a sound takes to die away when she presses Stop all: short enough to feel instant, long enough not to click. */
export const STOP_FADE_SECONDS = 0.012;
/** How quickly a volume follows its slider, so dragging it doesn't crackle. */
export const VOLUME_SMOOTHING_SECONDS = 0.015;
/** Most sounds that can play at once. Past this, the oldest one is cut off. */
export const MAX_VOICES = 32;
/** Sound files smaller than this are got ready ahead of time. Bigger ones are got ready the first time they're tapped. */
export const PRELOAD_BELOW_BYTES = 1024 * 1024;
/** Memory the ready-to-play sounds may use. */
export const DEFAULT_BUDGET_BYTES = 128 * 1024 * 1024;
/** Getting sounds ready ahead of time stops once they use this share of the memory limit. */
const PRELOAD_BUDGET_SHARE = 0.5;

// The few parts of the Web Audio API the soundboard uses. The real browser objects fit these, and the tests use stand-ins.
export interface AudioParamLike {
  value: number;
  cancelScheduledValues(startTime: number): unknown;
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;
}
interface AudioNodeLike {
  connect(destination: unknown): unknown;
  disconnect(): void;
}
export interface GainNodeLike extends AudioNodeLike {
  gain: AudioParamLike;
}
export interface AudioBufferLike {
  readonly length: number;
  readonly numberOfChannels: number;
  readonly duration: number;
}
export interface SourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  onended: (() => void) | null;
  start(when?: number): void;
  stop(when?: number): void;
}
export interface AudioContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  createGain(): GainNodeLike;
  createBufferSource(): SourceNodeLike;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
  resume(): Promise<void>;
}

export type SoundProblemKind = 'unavailable' | 'missing' | 'ogg' | 'damaged';

export const soundMessages: Record<SoundProblemKind, string> = {
  unavailable: "This browser can't play sounds. Try Chrome, Edge, Firefox or Safari.",
  missing: "I can't find that sound's file any more. Use ✏️ Edit, then Replace file, to add it again.",
  ogg: "This device can't play OGG sounds yet. Add the sound again as an MP3 or WAV.",
  damaged: "I couldn't play that file. It may be damaged. Try adding it again, or use an MP3 or WAV.",
};

/** A sound couldn't be played. The message is safe to show to her as it is. */
export class SoundProblem extends Error {
  readonly kind: SoundProblemKind;
  constructor(kind: SoundProblemKind) {
    super(soundMessages[kind]);
    this.name = 'SoundProblem';
    this.kind = kind;
  }
}

export interface MediaFile {
  data: ArrayBuffer;
  ext: AudioExt;
}

export interface EngineDeps {
  /** Makes the browser's AudioContext, or returns null when this browser has none. */
  createContext: () => AudioContextLike | null;
  /** Reads a stored sound file. */
  loadMedia: (mediaId: string) => Promise<MediaFile | undefined>;
  /** How big each stored file is, so small ones can be got ready ahead of time. */
  mediaSizes?: () => Promise<Map<string, number>>;
  budgetBytes?: number;
  maxVoices?: number;
  /** Lets the page breathe between sounds while getting them ready. */
  yieldToBrowser?: () => Promise<void>;
  canPlayOgg?: () => boolean;
}

export interface PlayableSound {
  id: string;
  mediaId: string;
  /** 0 to 1. */
  volume: number;
}

export type PlayResult = { ok: true } | { ok: false; message: string };

export interface EngineState {
  /** Sounds that are playing right now. */
  readonly playing: ReadonlySet<string>;
  /** Sounds being got ready after a tap. A big sound takes a moment the first time. */
  readonly loading: ReadonlySet<string>;
}

interface Voice {
  soundId: string;
  source: SourceNodeLike;
  gain: GainNodeLike;
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Plays her sounds. One AudioContext serves the whole app: every tap makes a new voice (a source and its own volume)
 * that feeds one master volume, so taps overlap, each sound has its own level, and Stop all silences everything at once.
 */
export class SoundEngine {
  private readonly deps: EngineDeps;
  private readonly cache: DecodedCache<AudioBufferLike>;
  private readonly maxVoices: number;
  private readonly pending = new Map<string, Promise<AudioBufferLike>>();
  private readonly voices = new Set<Voice>();
  private readonly loadingCounts = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private ctx: AudioContextLike | null = null;
  private master: GainNodeLike | null = null;
  private masterVolume = 1;
  /** Goes up every time she presses Stop all, so a sound that was still getting ready knows not to start. */
  private generation = 0;
  private current: EngineState = { playing: new Set(), loading: new Set() };
  private wanted: string[] = [];
  private preloadChain: Promise<void> = Promise.resolve();

  constructor(deps: EngineDeps) {
    this.deps = deps;
    this.cache = new DecodedCache(deps.budgetBytes ?? DEFAULT_BUDGET_BYTES);
    this.maxVoices = deps.maxVoices ?? MAX_VOICES;
  }

  // The screen follows the engine through these two (they suit React's useSyncExternalStore).
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly getState = (): EngineState => this.current;

  /** Whether sound can start right now. False until the first tap, and while the phone has paused audio. */
  isReady(): boolean {
    return this.ctx?.state === 'running';
  }

  /**
   * Gets the sound ready. The browser only lets sound start from a tap or key press, so the app calls this on
   * every one of them. It also wakes sound up again after a phone call or switching apps.
   */
  unlock(): void {
    const ctx = this.safely(() => this.ensureContext());
    if (ctx) this.wake(ctx);
  }

  /** Wakes sound up again if it was paused, without starting it for the first time. */
  recover(): void {
    if (this.ctx) this.wake(this.ctx);
  }

  /**
   * Plays a sound. Taps overlap, so playing the same sound again starts another copy.
   * Call this straight from the tap: the browser decides then whether sound may start.
   */
  play(sound: PlayableSound): Promise<PlayResult> {
    const ctx = this.safely(() => this.ensureContext());
    if (!ctx) return Promise.resolve({ ok: false, message: soundMessages.unavailable });
    this.wake(ctx);
    return this.playWith(ctx, sound, this.generation);
  }

  /** Silences every sound at once (with a blink-short fade so it doesn't click), including ones still getting ready. */
  stopAll(): void {
    this.generation += 1;
    const stopping = [...this.voices];
    this.voices.clear();
    for (const voice of stopping) this.release(voice);
    this.publish();
  }

  /** The master volume, 0 to 1. */
  setMasterVolume(volume: number): void {
    this.masterVolume = gainFor(volume);
    if (!this.ctx || !this.master) return;
    this.ramp(this.master.gain, this.masterVolume);
  }

  /** Changes how loud a sound is, even while it plays. */
  setSoundVolume(soundId: string, volume: number): void {
    for (const voice of this.voices) if (voice.soundId === soundId) this.ramp(voice.gain.gain, gainFor(volume));
  }

  /**
   * Checks that a sound file can be played on this device, and gives back the decoded sound. If it can't be,
   * this throws a SoundProblem whose message says why (an OGG on an iPhone that is too old, a damaged file, ...).
   */
  async decode(bytes: ArrayBuffer, ext: AudioExt): Promise<AudioBufferLike> {
    const ctx = this.safely(() => this.ensureContext());
    if (!ctx) throw new SoundProblem('unavailable');
    // Decoding takes the bytes away from whoever passed them, and the caller still has to save them.
    return this.decodeWith(ctx, bytes.slice(0), ext);
  }

  /** Keeps a sound that was just decoded, so its first tap is instant. */
  remember(mediaId: string, buffer: AudioBufferLike): void {
    this.cache.set(mediaId, buffer);
  }

  /** Lets go of a sound that isn't used any more. */
  forget(mediaId: string): void {
    this.cache.delete(mediaId);
  }

  /**
   * Says which sounds she has. The small ones are got ready in the background so their first tap is instant;
   * big ones wait for their first tap. Safe to call again whenever her sounds change.
   */
  preload(mediaIds: readonly string[]): Promise<void> {
    this.wanted = [...mediaIds];
    return this.schedulePreload();
  }

  /** Closes the sound system. The app never needs this; the tests do. */
  async close(): Promise<void> {
    this.stopAll();
    this.cache.clear();
    const ctx = this.ctx as (AudioContextLike & { close?: () => Promise<void> }) | null;
    this.ctx = null;
    this.master = null;
    await ctx?.close?.();
  }

  private safely<T>(job: () => T): T | null {
    try {
      return job();
    } catch {
      return null;
    }
  }

  private ensureContext(): AudioContextLike | null {
    if (this.ctx && this.ctx.state !== 'closed') return this.ctx;
    const ctx = this.deps.createContext();
    if (!ctx) return null;
    const master = ctx.createGain();
    master.gain.value = this.masterVolume;
    master.connect(ctx.destination);
    if (this.ctx) {
      // The browser shut the old one down, and anything that was playing went with it.
      this.voices.clear();
      this.publish();
    }
    this.ctx = ctx;
    this.master = master;
    setAudioSession('playback');
    // Sound is allowed now, so her small sounds can be got ready in the background.
    queueMicrotask(() => void this.schedulePreload());
    return ctx;
  }

  private wake(ctx: AudioContextLike): void {
    if (ctx.state === 'running') return;
    try {
      // Not awaited: on iPhone this only finishes once the tap is over, and sounds can be lined up before that.
      Promise.resolve(ctx.resume()).catch(() => undefined);
    } catch {
      // Sound stays paused. The next tap tries again.
    }
  }

  private ramp(param: AudioParamLike, target: number): void {
    const now = this.ctx?.currentTime ?? 0;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(target, now, VOLUME_SMOOTHING_SECONDS);
  }

  private async playWith(ctx: AudioContextLike, sound: PlayableSound, generation: number): Promise<PlayResult> {
    let buffer = this.cache.get(sound.mediaId);
    if (!buffer) {
      this.markLoading(sound.id, 1);
      try {
        buffer = await this.load(ctx, sound.mediaId);
      } catch (error) {
        return { ok: false, message: error instanceof SoundProblem ? error.message : soundMessages.damaged };
      } finally {
        this.markLoading(sound.id, -1);
      }
    }
    // She pressed Stop all while this one was getting ready.
    if (generation !== this.generation) return { ok: true };
    try {
      this.start(ctx, sound, buffer);
    } catch {
      return { ok: false, message: soundMessages.damaged };
    }
    return { ok: true };
  }

  private start(ctx: AudioContextLike, sound: PlayableSound, buffer: AudioBufferLike): void {
    const master = this.master;
    if (!master) throw new Error('The sound system is not ready.');
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = gainFor(sound.volume);
    source.connect(gain);
    gain.connect(master);
    const voice: Voice = { soundId: sound.id, source, gain };
    source.onended = () => this.finish(voice);
    try {
      source.start();
    } catch (error) {
      source.disconnect();
      gain.disconnect();
      throw error;
    }
    this.voices.add(voice);
    while (this.voices.size > this.maxVoices) {
      const oldest = this.voices.values().next().value as Voice;
      this.voices.delete(oldest);
      this.release(oldest);
    }
    this.publish();
  }

  /** A sound reached its end by itself. */
  private finish(voice: Voice): void {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    voice.source.disconnect();
    voice.gain.disconnect();
    this.publish();
  }

  /** Cuts a sound off with a very short fade. The screen has already stopped showing it as playing. */
  private release(voice: Voice): void {
    const { source, gain } = voice;
    const ctx = this.ctx;
    const tidy = () => {
      source.onended = null;
      source.disconnect();
      gain.disconnect();
    };
    try {
      if (ctx && ctx.state === 'running') {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + STOP_FADE_SECONDS);
        source.onended = tidy;
        source.stop(now + STOP_FADE_SECONDS);
        return;
      }
      source.stop();
    } catch {
      // It had already finished.
    }
    tidy();
  }

  private markLoading(soundId: string, change: 1 | -1): void {
    const count = (this.loadingCounts.get(soundId) ?? 0) + change;
    if (count > 0) this.loadingCounts.set(soundId, count);
    else this.loadingCounts.delete(soundId);
    this.publish();
  }

  private publish(): void {
    const playing = new Set<string>();
    for (const voice of this.voices) playing.add(voice.soundId);
    const loading = new Set(this.loadingCounts.keys());
    if (sameSet(playing, this.current.playing) && sameSet(loading, this.current.loading)) return;
    this.current = { playing, loading };
    for (const listener of [...this.listeners]) listener();
  }

  /** Reads and decodes a stored sound once, however many taps ask for it at the same time. */
  private load(ctx: AudioContextLike, mediaId: string): Promise<AudioBufferLike> {
    const existing = this.pending.get(mediaId);
    if (existing) return existing;
    const job = (async () => {
      const file = await this.deps.loadMedia(mediaId);
      if (!file) throw new SoundProblem('missing');
      const buffer = await this.decodeWith(ctx, file.data, file.ext);
      this.cache.set(mediaId, buffer);
      return buffer;
    })();
    this.pending.set(mediaId, job);
    const done = () => {
      if (this.pending.get(mediaId) === job) this.pending.delete(mediaId);
    };
    job.then(done, done);
    return job;
  }

  private async decodeWith(ctx: AudioContextLike, data: ArrayBuffer, ext: AudioExt): Promise<AudioBufferLike> {
    try {
      return await ctx.decodeAudioData(data);
    } catch {
      const oggTooOld = ext === 'ogg' && !(this.deps.canPlayOgg ?? canPlayOgg)();
      throw new SoundProblem(oggTooOld ? 'ogg' : 'damaged');
    }
  }

  private schedulePreload(): Promise<void> {
    if (!this.ctx) return Promise.resolve();
    this.preloadChain = this.preloadChain.then(() => this.runPreload()).catch(() => undefined);
    return this.preloadChain;
  }

  private async runPreload(): Promise<void> {
    const ctx = this.ctx;
    const readSizes = this.deps.mediaSizes;
    if (!ctx || !readSizes) return;
    let sizes: Map<string, number>;
    try {
      sizes = await readSizes();
    } catch {
      return;
    }
    const pause = this.deps.yieldToBrowser ?? nextTurn;
    for (const id of this.wanted) {
      if (this.cache.has(id) || this.pending.has(id)) continue;
      const size = sizes.get(id);
      if (size === undefined || size >= PRELOAD_BELOW_BYTES) continue;
      if (this.cache.bytes >= this.cache.limitBytes * PRELOAD_BUDGET_SHARE) break;
      try {
        await this.load(ctx, id);
      } catch {
        // It will say what's wrong when she taps it.
      }
      await pause();
    }
  }
}
