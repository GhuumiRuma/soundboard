import { describe, expect, it } from 'vitest';
import { flat, join, RATE, silence, tone } from '../../test/samples';
import {
  buildWaveform,
  clock,
  endFrameFor,
  fallBack,
  framesToMs,
  levelPercent,
  maxRecordingFrames,
  minSaveFrames,
  msToFrames,
  peakOf,
  seconds,
  stamp,
  startFrameFor,
  suggestTrim,
  WAVEFORM_BARS,
} from './rules';

describe('peak', () => {
  it('is the loudest sample, up or down', () => {
    expect(peakOf([0.2, -0.7, 0.5])).toBe(0.7);
    expect(peakOf([])).toBe(0);
  });

  it('only looks at the part asked for', () => {
    expect(peakOf([0.9, 0.1, 0.3, 0.8], 1, 3)).toBe(0.3);
  });

  it("ignores anything that isn't a number", () => {
    expect(peakOf([0.2, Number.NaN, Number.POSITIVE_INFINITY, -0.4, Number.NEGATIVE_INFINITY])).toBe(0.4);
  });
});

describe('the waveform picture', () => {
  it('has 240 bars', () => {
    expect(WAVEFORM_BARS).toBe(240);
    expect(buildWaveform(tone(1, 0.5))).toHaveLength(240);
  });

  it('is flat for an empty recording', () => {
    const bars = buildWaveform(new Float32Array(0));
    expect(bars).toHaveLength(240);
    expect(bars.every((bar) => bar === 0)).toBe(true);
  });

  it('shows the loudest part full height and the rest in proportion', () => {
    const samples = join(flat(0.5, 0.2), flat(0.5, 0.8));
    const bars = buildWaveform(samples, 2);
    expect(bars[1]).toBeCloseTo(1, 10);
    expect(bars[0]).toBeCloseTo(0.25, 5);
  });

  it("doesn't stretch a very quiet recording to full height", () => {
    const bars = buildWaveform(flat(1, 0.01), 4);
    for (const bar of bars) expect(bar).toBeCloseTo(0.2, 5);
  });

  it('puts a sound where it happens in the recording', () => {
    const samples = new Float32Array(2400);
    samples[1200] = -1;
    const bars = buildWaveform(samples, 240);
    expect(bars[120]).toBe(1);
    expect(bars.filter((bar) => bar > 0)).toHaveLength(1);
  });

  it('gives every bar something to look at when there are fewer samples than bars', () => {
    const bars = buildWaveform(Float32Array.of(0.1, 0.5, 0.2), 240);
    expect(bars).toHaveLength(240);
    expect(bars.every((bar) => bar >= 0 && bar <= 1)).toBe(true);
    expect(Math.max(...bars)).toBe(1);
  });

  it("ignores values that aren't numbers", () => {
    const bars = buildWaveform(Float32Array.of(Number.NaN, Number.POSITIVE_INFINITY, 0.5, Number.NEGATIVE_INFINITY), 4);
    expect(bars.every((bar) => Number.isFinite(bar))).toBe(true);
    expect(bars[2]).toBe(1);
  });
});

describe('cutting the quiet at the start and end', () => {
  it('keeps from just before the first sound to a little after the last (48 kHz)', () => {
    const samples = join(silence(1), tone(1, 0.5), silence(1));
    const trim = suggestTrim(samples, RATE);
    expect(trim.found).toBe(true);
    expect(trim.start).toBe(48000 - 3840);
    expect(trim.end).toBe(96000 + 9600);
  });

  it('works at 44.1 kHz too', () => {
    const rate = 44100;
    const samples = join(silence(1, rate), tone(1, 0.5, rate), silence(1, rate));
    const trim = suggestTrim(samples, rate);
    expect(trim.start).toBe(44100 - 3528);
    expect(trim.end).toBe(88200 + 8820);
  });

  it('keeps at least a little from before a short click', () => {
    const samples = silence(3);
    samples[50000] = 0.5;
    const trim = suggestTrim(samples, RATE);
    expect(trim).toEqual({ found: true, start: 49920 - 3840, end: 50400 + 9600 });
  });

  it("doesn't go before the start or past the end of the recording", () => {
    const samples = tone(0.5, 0.5);
    expect(suggestTrim(samples, RATE)).toEqual({ found: true, start: 0, end: samples.length });
  });

  it('says so when there is no sound at all', () => {
    const samples = silence(2);
    expect(suggestTrim(samples, RATE)).toEqual({ found: false, start: 0, end: samples.length });
  });

  it('counts anything quieter than the hiss line as quiet', () => {
    expect(suggestTrim(flat(1, 0.0029), RATE).found).toBe(false);
    expect(suggestTrim(flat(1, 0.0031), RATE).found).toBe(true);
  });

  it('finds nothing in an empty recording', () => {
    expect(suggestTrim(new Float32Array(0), RATE)).toEqual({ found: false, start: 0, end: 0 });
  });
});

describe('times and frames', () => {
  it('turns milliseconds into whole frames and back', () => {
    expect(msToFrames(1000, 48000)).toBe(48000);
    expect(msToFrames(1500, 44100)).toBe(66150);
    expect(framesToMs(48000, 48000)).toBe(1000);
    expect(framesToMs(48123, 48000)).toBe(1002);
  });

  it('never goes below none or into nonsense', () => {
    expect(msToFrames(-20, 48000)).toBe(0);
    expect(msToFrames(Number.NaN, 48000)).toBe(0);
    expect(framesToMs(-5, 48000)).toBe(0);
    expect(framesToMs(100, 0)).toBe(0);
  });

  it('knows the shortest clip that can be saved (100 ms) and the longest recording (1 minute)', () => {
    expect(minSaveFrames(48000)).toBe(4800);
    expect(minSaveFrames(44100)).toBe(4410);
    expect(minSaveFrames(8)).toBe(1);
    expect(maxRecordingFrames(48000)).toBe(2880000);
    expect(maxRecordingFrames(44100)).toBe(2646000);
  });
});

describe('the Start and End handles', () => {
  const total = 144000;

  it('puts Start where it is dragged', () => {
    expect(startFrameFor(500, RATE, total)).toBe(24000);
  });

  it("can't push Start to or past End: at least 100 ms stays", () => {
    expect(startFrameFor(5000, RATE, 48000)).toBe(43200);
    expect(startFrameFor(5000, RATE, 100)).toBe(0);
  });

  it("can't take Start below the very beginning", () => {
    expect(startFrameFor(-300, RATE, total)).toBe(0);
    expect(startFrameFor(Number.NaN, RATE, total)).toBe(0);
  });

  it('puts End where it is dragged', () => {
    expect(endFrameFor(1500, RATE, 0, total)).toBe(72000);
  });

  it("can't pull End closer than 100 ms to Start", () => {
    expect(endFrameFor(100, RATE, 24000, total)).toBe(28800);
  });

  it("can't push End past the end of the recording", () => {
    expect(endFrameFor(2999, RATE, 0, total)).toBe(143952);
    expect(endFrameFor(9999, RATE, 0, total)).toBe(total);
  });

  it('keeps everything to the very end when End is pulled all the way, even when the length is not a whole millisecond', () => {
    const frames = 48123;
    expect(endFrameFor(framesToMs(frames, RATE), RATE, 0, frames)).toBe(frames);
  });
});

describe('the level meter', () => {
  it('is empty for silence and full at the top', () => {
    expect(levelPercent(0)).toBe(0);
    expect(levelPercent(0.001)).toBe(0);
    expect(levelPercent(Number.NaN)).toBe(0);
    expect(levelPercent(1)).toBe(100);
    expect(levelPercent(2)).toBe(100);
  });

  it('shows -60 dB to 0 dB as 0 to 100', () => {
    expect(levelPercent(0.1)).toBe(67);
    expect(levelPercent(0.5)).toBe(90);
    expect(levelPercent(0.0011)).toBe(1);
  });

  it('lets a loud moment fall back, a bit slower than it came', () => {
    expect(fallBack(1, 0)).toBe(1);
    expect(fallBack(1, 0.25)).toBeCloseTo(Math.exp(-1), 6);
    expect(fallBack(1, -4)).toBe(1);
  });

  it('settles at nothing once it is too quiet to see', () => {
    expect(fallBack(0.001, 0.05)).toBe(0);
    expect(fallBack(0.5, 5)).toBe(0);
  });
});

describe('times as they are shown', () => {
  it('counts up as minutes and seconds', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(7000)).toBe('0:07');
    expect(clock(60000)).toBe('1:00');
    expect(clock(61999)).toBe('1:01');
    expect(clock(599999)).toBe('9:59');
    expect(clock(-5)).toBe('0:00');
    expect(clock(Number.NaN)).toBe('0:00');
  });

  it('shows the handles to the tenth of a second', () => {
    expect(stamp(0)).toBe('0:00.0');
    expect(stamp(7500)).toBe('0:07.5');
    expect(stamp(60000)).toBe('1:00.0');
    expect(stamp(61234)).toBe('1:01.2');
    expect(stamp(-1)).toBe('0:00.0');
  });

  it('shows how long a part is in seconds', () => {
    expect(seconds(0)).toBe('0.0');
    expect(seconds(7500)).toBe('7.5');
    expect(seconds(3249)).toBe('3.2');
    expect(seconds(60000)).toBe('60.0');
  });
});
