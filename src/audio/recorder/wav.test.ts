import { describe, expect, it } from 'vitest';
import { flat, RATE, tone } from '../../test/samples';
import { CEILING, encodeWav, fadeFrames, pcm16ToFloat, renderPcm16, renderWav, WAV_HEADER_BYTES, wavSize } from './wav';

const text = (view: DataView, offset: number, length: number): string =>
  Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join('');

describe('the WAV file', () => {
  it('has the standard 44-byte header for one channel of 16 bits', () => {
    const file = encodeWav(Int16Array.of(1, -1, 32767), 44100);
    const view = new DataView(file);
    expect(file.byteLength).toBe(WAV_HEADER_BYTES + 6);
    expect(text(view, 0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + 6);
    expect(text(view, 8, 4)).toBe('WAVE');
    expect(text(view, 12, 4)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(28, true)).toBe(88200);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(view, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(6);
  });

  it('stores the samples little-endian after the header', () => {
    const view = new DataView(encodeWav(Int16Array.of(1, -2, 32767, -32768), 48000));
    expect(view.getInt16(44, true)).toBe(1);
    expect(view.getInt16(46, true)).toBe(-2);
    expect(view.getInt16(48, true)).toBe(32767);
    expect(view.getInt16(50, true)).toBe(-32768);
  });

  it('is a valid file even with nothing in it', () => {
    const file = encodeWav(new Int16Array(0), 48000);
    expect(file.byteLength).toBe(44);
    expect(new DataView(file).getUint32(40, true)).toBe(0);
  });

  it('knows how big it will be', () => {
    expect(wavSize(0)).toBe(44);
    expect(wavSize(48000)).toBe(44 + 96000);
    expect(renderWav(flat(1, 0.5), RATE, 0, 48000).byteLength).toBe(wavSize(48000));
  });
});

describe('getting a recording ready to save', () => {
  it('keeps only the part between Start and End', () => {
    const samples = tone(1, 0.5);
    expect(renderPcm16(samples, RATE, 1000, 3000)).toHaveLength(2000);
  });

  it('copes with a Start and End that are out of order, fractional or past the recording', () => {
    const samples = flat(0.1, 0.5);
    expect(renderPcm16(samples, RATE, 300, 100)).toHaveLength(0);
    expect(renderPcm16(samples, RATE, -50, 100.9)).toHaveLength(100);
    expect(renderPcm16(samples, RATE, 4000, 999999)).toHaveLength(800);
  });

  it("doesn't change how loud a quiet recording is (it is never turned up)", () => {
    const pcm = renderPcm16(flat(1, 0.01), RATE, 0, RATE);
    expect(pcm[RATE / 2]).toBe(Math.round(Math.fround(0.01) * 32767));
  });

  it('keeps a normal recording as it is, to the nearest step', () => {
    const pcm = renderPcm16(flat(1, 0.5), RATE, 0, RATE);
    expect(pcm[RATE / 2]).toBe(16384);
    const negative = renderPcm16(flat(1, -0.5), RATE, 0, RATE);
    expect(negative[RATE / 2]).toBe(-16384);
  });

  it('turns a loud recording down so its loudest point is the ceiling', () => {
    expect(CEILING).toBe(0.98);
    const pcm = renderPcm16(flat(1, 1), RATE, 0, RATE);
    expect(pcm[RATE / 2]).toBe(Math.round(0.98 * 32767));
    const clipped = renderPcm16(flat(1, 2), RATE, 0, RATE);
    expect(Math.max(...clipped)).toBe(Math.round(0.98 * 32767));
  });

  it('turns it down by the loudest point of the part that is kept, not of all of it', () => {
    const samples = new Float32Array(48000).fill(0.1);
    samples.fill(1, 0, 1000);
    const kept = renderPcm16(samples, RATE, 10000, 40000);
    expect(kept[10000]).toBe(Math.round(Math.fround(0.1) * 32767));
  });

  it('fades the two ends over 4 ms so a cut never clicks', () => {
    expect(fadeFrames(48000)).toBe(192);
    expect(fadeFrames(44100)).toBe(176);
    const pcm = renderPcm16(flat(1, 0.5), RATE, 0, RATE);
    expect(pcm[0]).toBe(0);
    expect(pcm[96]).toBe(Math.round(0.5 * 0.5 * 32767));
    expect(pcm[191]).toBeLessThan(pcm[192]);
    expect(pcm[192]).toBe(16384);
    expect(pcm[RATE - 1]).toBe(0);
    expect(pcm[RATE - 1 - 96]).toBe(Math.round(0.5 * 0.5 * 32767));
    expect(pcm[RATE - 1 - 192]).toBe(16384);
  });

  it('shortens the fades for a very short clip, and never divides by nothing', () => {
    expect(Array.from(renderPcm16(flat(1, 0.5), RATE, 0, 1))).toEqual([16384]);
    expect(Array.from(renderPcm16(flat(1, 0.5), RATE, 0, 3))).toEqual([0, 16384, 0]);
    expect(renderPcm16(flat(1, 0.5), RATE, 0, 0)).toHaveLength(0);
  });

  it('treats anything that is not a number as silence', () => {
    const pcm = renderPcm16(Float32Array.of(Number.NaN, Number.POSITIVE_INFINITY, 0.5, 0.5, 0.5), 8, 0, 5);
    expect(pcm[0]).toBe(0);
    expect(pcm[1]).toBe(0);
    expect(pcm[2]).toBe(16384);
  });

  it('never goes past what 16 bits can hold', () => {
    const pcm = renderPcm16(flat(0.1, 5), RATE, 0, 4800);
    expect(Math.max(...pcm)).toBeLessThanOrEqual(32767);
    expect(Math.min(...pcm)).toBeGreaterThanOrEqual(-32768);
  });

  it('gives back what the file holds when it is turned into numbers again', () => {
    const samples = tone(0.5, 0.6);
    const pcm = renderPcm16(samples, RATE, 0, samples.length);
    const back = pcm16ToFloat(pcm);
    expect(back).toHaveLength(samples.length);
    expect(back[12000]).toBeCloseTo(samples[12000], 3);
    expect(Math.max(...back)).toBeLessThanOrEqual(1);
  });
});

describe('numbers from the file', () => {
  it('turns 16-bit steps into -1 to 1', () => {
    const back = pcm16ToFloat(Int16Array.of(0, 32767, -32768, 16384));
    expect(back[0]).toBe(0);
    expect(back[1]).toBeCloseTo(32767 / 32768, 8);
    expect(back[2]).toBe(-1);
    expect(back[3]).toBe(0.5);
  });
});
