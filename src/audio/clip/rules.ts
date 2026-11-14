import { soundNameFromFile } from '../../model/rules';
import { MAX_SOUND_BYTES } from '../../storage/import';
import { framesToMs, minSaveFrames, msToFrames, suggestTrim } from '../recorder/rules';
import { WAV_HEADER_BYTES } from '../recorder/wav';

/**
 * The rules for clipping a sound out of a longer file (a video, or a long recording). Like the recorder's, they are
 * plain maths on a list of samples (numbers from -1 to 1), so they run and are tested without a browser.
 */

/** The biggest file she can open to clip from. Bigger than a sound, because a video holds a picture too. */
export const MAX_SOURCE_BYTES = 200 * 1024 * 1024;

/** The longest file she can open. The whole sound of it is held in memory while she picks a part. */
export const MAX_SOURCE_SECONDS = 10 * 60;
export const MAX_SOURCE_MS = MAX_SOURCE_SECONDS * 1000;

/** The longest a clip can be. */
export const MAX_CLIP_SECONDS = 3 * 60;

/** A file this short (or shorter) starts out whole, with the quiet at each end cut. Longer ones start with a short part. */
export const WHOLE_FILE_SECONDS = 60;

/** How much of a long file is picked to begin with, from its first sound. */
export const STARTING_CLIP_SECONDS = 10;

/** A file longer than this can be zoomed in on, to place Start and End exactly. */
export const ZOOM_AFTER_SECONDS = 5;

/** What a clip is called when its file has no name to go by. */
export const DEFAULT_CLIP_NAME = 'My clip';

/**
 * How the channels of a sound are mixed into one, the way the Web Audio standard does it for speakers: left and right
 * are shared, the centre (where the voices are in a film) is kept whole, and the bass-only channel is left out.
 */
const mixWeights = (channels: number): number[] => {
  switch (channels) {
    case 1:
      return [1];
    case 2:
      return [0.5, 0.5];
    case 4:
      return [0.25, 0.25, 0.25, 0.25];
    case 6:
      return [Math.SQRT1_2, Math.SQRT1_2, 1, 0, 0.5, 0.5];
    case 8:
      return [Math.SQRT1_2, Math.SQRT1_2, 1, 0, 0.5, 0.5, 0.5, 0.5];
    default:
      return new Array<number>(channels).fill(1 / channels);
  }
};

/** One channel of sound from however many there are. It is always a copy, so the original can be let go of. */
export const downmixToMono = (channels: readonly ArrayLike<number>[]): Float32Array => {
  const frames = channels.reduce((most, channel) => Math.max(most, channel.length), 0);
  const out = new Float32Array(frames);
  const weights = mixWeights(channels.length);
  channels.forEach((channel, at) => {
    const weight = weights[at];
    if (weight === 0) return;
    for (let i = 0; i < channel.length; i++) out[i] += channel[i] * weight;
  });
  return out;
};

/** The most frames a clip can hold: three minutes, and never more than a sound can be once it is a WAV file. */
export const maxClipFrames = (rate: number): number =>
  Math.min(Math.floor(MAX_CLIP_SECONDS * rate), Math.floor((MAX_SOUND_BYTES - WAV_HEADER_BYTES) / 2));

/** The most frames a file can hold and still be opened. */
export const maxSourceFrames = (rate: number): number => Math.floor(MAX_SOURCE_SECONDS * rate);

/** Whether a clip of this many frames is longer than a clip can be. */
export const isTooLong = (frames: number, rate: number): boolean => frames > maxClipFrames(rate);

/** A handle that was moved: where it ended up, in frames, and whether the longest clip held it back. */
export interface Moved {
  frame: number;
  limited: boolean;
}

/**
 * Moving the Start handle: it can't pass the End handle (less the shortest clip that can be saved), can't go below the
 * very beginning, and can't leave a clip longer than a clip can be.
 */
export const moveStart = (ms: number, rate: number, endFrame: number): Moved => {
  const wanted = msToFrames(ms, rate);
  const latest = Math.max(0, endFrame - minSaveFrames(rate));
  const earliest = Math.max(0, endFrame - maxClipFrames(rate));
  const frame = Math.min(Math.max(wanted, earliest), latest);
  return { frame, limited: wanted < earliest };
};

/**
 * Moving the End handle: it can't come closer to Start than the shortest clip that can be saved, can't go past the
 * end of the file, and can't leave a clip longer than a clip can be. Pulling it to the very end keeps to the end.
 */
export const moveEnd = (ms: number, rate: number, startFrame: number, totalFrames: number): Moved => {
  const wanted = Number.isFinite(ms) && ms >= framesToMs(totalFrames, rate) ? totalFrames : msToFrames(ms, rate);
  const earliest = Math.min(totalFrames, startFrame + minSaveFrames(rate));
  const latest = Math.min(totalFrames, startFrame + maxClipFrames(rate));
  const frame = Math.min(Math.max(wanted, earliest), latest);
  return { frame, limited: wanted > latest };
};

/** Where the clip starts out: from the first sound to the last in a short file, or a short part from the first sound. */
export interface StartingSelection {
  start: number;
  end: number;
  /** The file is a long one, so only a short part of it is picked and she is told how to choose the rest. */
  long: boolean;
}

/** Null when the file has no sound in it at all. */
export const startingSelection = (samples: ArrayLike<number>, rate: number): StartingSelection | null => {
  const trim = suggestTrim(samples, rate);
  if (!trim.found) return null;
  if (samples.length <= WHOLE_FILE_SECONDS * rate) return { start: trim.start, end: trim.end, long: false };
  const end = Math.min(samples.length, trim.start + Math.floor(STARTING_CLIP_SECONDS * rate));
  return { start: trim.start, end, long: true };
};

/** Whether the file is long enough to zoom in on. */
export const canZoomFile = (totalFrames: number, rate: number): boolean => totalFrames > ZOOM_AFTER_SECONDS * rate;

/**
 * The part of the file a zoomed-in picture shows: the clip with some room around it (a second, or half the clip's
 * length if that is more), so the handles have somewhere to go.
 */
export const zoomWindow = (startFrame: number, endFrame: number, totalFrames: number, rate: number): { from: number; to: number } => {
  const padding = Math.max(Math.floor(rate), Math.floor((endFrame - startFrame) / 2));
  return { from: Math.max(0, startFrame - padding), to: Math.min(totalFrames, endFrame + padding) };
};

/** How far the keys move a handle, to suit how much of the file the slider spans: small steps when zoomed in. */
export const keyStepsFor = (spanMs: number): { stepMs: number; pageMs: number } => {
  const stepMs = Math.max(50, Math.round(spanMs / 600));
  return { stepMs, pageMs: stepMs * 10 };
};

/** A name for the clip from the name of its file: "funny_moment.mp4" becomes "Funny moment". */
export const clipNameFromFile = (fileName: string): string => {
  const name = soundNameFromFile(fileName);
  // A file with no name to go by is given "New sound" by soundNameFromFile.
  return name === 'New sound' ? DEFAULT_CLIP_NAME : name;
};
