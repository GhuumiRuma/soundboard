import { peakOf } from './rules';

/**
 * Writes a recording as a WAV file, ported from StreamStudio's WavFile.cs. Every player reads a WAV, and so does the
 * sound library. Unlike StreamStudio (stereo) a phone or laptop microphone gives one channel, so this is one channel
 * of 16 bits at whatever rate the device records at.
 */

export const WAV_HEADER_BYTES = 44;

/**
 * What goes above this is turned down to it so it can't distort. A quiet recording isn't turned up: that would make
 * the hiss louder too.
 */
export const CEILING = 0.98;

/** The two ends fade over this many milliseconds, so a cut never clicks. */
export const FADE_MS = 4;

const clampInt = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);

/** A sample from -1 to 1 as a 16-bit number (anything that isn't a number is silence). */
const toInt16 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const scaled = value * 32767;
  return clampInt(Math.sign(scaled) * Math.round(Math.abs(scaled)), -32768, 32767);
};

/** How many frames the fade at each end lasts at this rate (4 ms). */
export const fadeFrames = (rate: number): number => Math.floor(rate / 250);

/** How big the file is for `frames` frames, in bytes. */
export const wavSize = (frames: number): number => WAV_HEADER_BYTES + Math.max(0, frames) * 2;

/**
 * The frames of `samples` from `start` up to, not including, `end`, ready to save: turned down if too loud, and with
 * the two ends faded.
 */
export const renderPcm16 = (samples: ArrayLike<number>, rate: number, start: number, end: number): Int16Array => {
  const first = clampInt(Math.floor(start), 0, samples.length);
  const last = clampInt(Math.floor(end), first, samples.length);
  const count = last - first;
  const out = new Int16Array(count);
  if (count === 0) return out;

  const peak = peakOf(samples, first, last);
  const gain = peak > CEILING ? CEILING / peak : 1;
  const fade = Math.min(fadeFrames(rate), Math.floor(count / 2));

  for (let frame = 0; frame < count; frame++) {
    let level = gain;
    if (frame < fade) level *= frame / fade;
    else if (frame >= count - fade) level *= (count - 1 - frame) / fade;
    out[frame] = toInt16(samples[first + frame] * level);
  }
  return out;
};

const writeText = (view: DataView, offset: number, text: string): void => {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
};

/** A one-channel, 16-bit WAV file around these samples. */
export const encodeWav = (pcm: Int16Array, rate: number): ArrayBuffer => {
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  writeText(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeText(view, 8, 'WAVE');
  writeText(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(view, 36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(WAV_HEADER_BYTES + i * 2, pcm[i], true);
  return buffer;
};

/** The finished WAV file for the part of a recording that is kept. */
export const renderWav = (samples: ArrayLike<number>, rate: number, start: number, end: number): ArrayBuffer =>
  encodeWav(renderPcm16(samples, rate, start, end), rate);

/** 16-bit samples back as numbers from -1 to 1, so what is played back is exactly what will be saved. */
export const pcm16ToFloat = (pcm: Int16Array): Float32Array => {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
  return out;
};
