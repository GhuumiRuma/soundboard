import { clamp01 } from '../../model/rules';

/**
 * The rules for recording a sound, ported from StreamStudio's RecordingReview.cs and RecorderPresenter.cs. It is all
 * plain maths on a list of samples (numbers from -1 to 1), so it runs and is tested without a microphone.
 */

/** How many bars the waveform picture has. */
export const WAVEFORM_BARS = 240;

/** The longest a recorded sound can be. */
export const MAX_RECORDING_SECONDS = 60;
export const MAX_RECORDING_MS = MAX_RECORDING_SECONDS * 1000;

/** A clip shorter than this isn't worth saving. */
export const MIN_SAVE_MS = 100;

/** Throwing away a recording this long (or longer) asks first. */
export const CONFIRM_AFTER_MS = 1000;

/** About -50 dB: quieter than this is room hiss, not a sound. */
export const TRIM_THRESHOLD = 0.003;

/** A very quiet recording isn't stretched to the full height: that would just show the hiss. */
export const QUIETEST_SCALE = 0.05;

/** How quickly the level meter falls back after a loud moment: it loses about two thirds every quarter second. */
export const LEVEL_FALL_SECONDS = 0.25;

const isNumber = (value: number): boolean => Number.isFinite(value);

/** The loudest sample from `from` up to, not including, `to`, ignoring anything that isn't a number. */
export const peakOf = (samples: ArrayLike<number>, from = 0, to = samples.length): number => {
  let peak = 0;
  const end = Math.min(to, samples.length);
  for (let i = Math.max(0, from); i < end; i++) {
    const value = Math.abs(samples[i]);
    if (value > peak && isNumber(value)) peak = value;
  }
  return peak;
};

/**
 * The picture of a recording that she trims by: the loudest sample in each of `bars` equal parts, from 0 to 1, where
 * 1 is the loudest part (or a bit more than a very quiet recording's loudest).
 */
export const buildWaveform = (samples: ArrayLike<number>, bars = WAVEFORM_BARS): number[] => {
  const count = Math.max(1, Math.floor(bars));
  const result = new Array<number>(count).fill(0);
  const frames = samples.length;
  if (frames === 0) return result;

  let loudest = 0;
  for (let bar = 0; bar < count; bar++) {
    const from = Math.floor((bar * frames) / count);
    let to = Math.floor(((bar + 1) * frames) / count);
    if (to <= from) to = Math.min(frames, from + 1);
    const peak = peakOf(samples, from, to);
    result[bar] = peak;
    if (peak > loudest) loudest = peak;
  }

  const scale = 1 / Math.max(loudest, QUIETEST_SCALE);
  for (let bar = 0; bar < count; bar++) result[bar] = Math.min(1, result[bar] * scale);
  return result;
};

/** The frames to keep: from `start` up to, not including, `end`. `found` is false when there is no sound at all. */
export interface TrimSuggestion {
  found: boolean;
  start: number;
  end: number;
}

/**
 * Where a recording starts and stops being worth keeping: from the first sound to the last, with 80 ms kept before it
 * (so its beginning isn't clipped) and 200 ms after (so it can fade away).
 */
export const suggestTrim = (samples: ArrayLike<number>, rate: number): TrimSuggestion => {
  const frames = samples.length;
  const window = Math.max(1, Math.floor(rate / 100));
  const lead = Math.floor((rate * 8) / 100);
  const tail = Math.floor(rate / 5);

  let first = -1;
  let last = -1;
  for (let from = 0; from < frames; from += window) {
    const to = Math.min(frames, from + window);
    if (peakOf(samples, from, to) < TRIM_THRESHOLD) continue;
    if (first < 0) first = from;
    last = to;
  }

  if (first < 0) return { found: false, start: 0, end: frames };
  return { found: true, start: Math.max(0, first - lead), end: Math.min(frames, last + tail) };
};

/** The shortest clip that can be saved, in frames. */
export const minSaveFrames = (rate: number): number => Math.max(1, Math.floor((MIN_SAVE_MS * rate) / 1000));

/** The most frames a recording can hold. */
export const maxRecordingFrames = (rate: number): number => Math.floor(MAX_RECORDING_SECONDS * rate);

/** A time in milliseconds, as whole frames (never less than none). */
export const msToFrames = (ms: number, rate: number): number => (isNumber(ms) ? Math.floor((Math.max(0, ms) * rate) / 1000) : 0);

/** Frames as whole milliseconds. */
export const framesToMs = (frames: number, rate: number): number => (rate > 0 ? Math.floor((Math.max(0, frames) * 1000) / rate) : 0);

/**
 * Moving the Start handle: where it goes, in frames. It can't pass the End handle (less the shortest clip that can be
 * saved) or go below the very beginning.
 */
export const startFrameFor = (ms: number, rate: number, endFrame: number): number => {
  const wanted = msToFrames(ms, rate);
  const latest = Math.max(0, endFrame - minSaveFrames(rate));
  return Math.min(Math.max(wanted, 0), latest);
};

/**
 * Moving the End handle: where it goes, in frames. It can't come closer to the Start handle than the shortest clip
 * that can be saved. Pulling it to the very end (or past it) keeps the whole recording to the end exactly.
 */
export const endFrameFor = (ms: number, rate: number, startFrame: number, totalFrames: number): number => {
  if (isNumber(ms) && ms >= framesToMs(totalFrames, rate)) return totalFrames;
  const wanted = msToFrames(ms, rate);
  const earliest = Math.min(totalFrames, startFrame + minSaveFrames(rate));
  return Math.min(Math.max(wanted, earliest), totalFrames);
};

/** How long the level meter shows a loud moment before it fades: `peak` after `seconds` of falling back. */
export const fallBack = (peak: number, seconds: number): number => {
  const next = peak * Math.exp(-Math.max(0, seconds) / LEVEL_FALL_SECONDS);
  return next < 0.001 ? 0 : next;
};

/** The level meter's fill, from 0 to 100: -60 dB or quieter is empty and 0 dB is full. */
export const levelPercent = (peak: number): number => {
  if (!(peak > 0.001)) return 0;
  const decibels = 20 * Math.log10(Math.min(peak, 1));
  return Math.round(clamp01((decibels + 60) / 60, 0) * 100);
};

const pad2 = (value: number): string => String(value).padStart(2, '0');
const wholeTenths = (ms: number): number => (isNumber(ms) ? Math.floor(Math.max(0, ms) / 100) : 0);

/** A time as it counts up while recording: 7 seconds is "0:07". */
export const clock = (ms: number): string => {
  const total = Math.floor(wholeTenths(ms) / 10);
  return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
};

/** A time to the tenth of a second, for the Start and End handles: 7.5 seconds is "0:07.5". */
export const stamp = (ms: number): string => {
  const tenths = wholeTenths(ms);
  return `${Math.floor(tenths / 600)}:${pad2(Math.floor(tenths / 10) % 60)}.${tenths % 10}`;
};

/** A length in seconds to the tenth, without the unit: 7.5 seconds is "7.5". */
export const seconds = (ms: number): string => {
  const tenths = wholeTenths(ms);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
};
