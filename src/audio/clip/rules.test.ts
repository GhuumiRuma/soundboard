import { describe, expect, it } from 'vitest';
import { MAX_SOUND_BYTES } from '../../storage/import';
import { join, RATE, silence, tone } from '../../test/samples';
import {
  canZoomFile,
  clipNameFromFile,
  downmixToMono,
  isTooLong,
  keyStepsFor,
  MAX_CLIP_SECONDS,
  MAX_SOURCE_BYTES,
  MAX_SOURCE_SECONDS,
  maxClipFrames,
  maxSourceFrames,
  moveEnd,
  moveStart,
  startingSelection,
  zoomWindow,
} from './rules';

const channel = (value: number, frames = 1): Float32Array => new Float32Array(frames).fill(value);

describe('mixing channels into one', () => {
  it('keeps a single channel as it is, as a copy', () => {
    const only = Float32Array.of(0.25, -0.5, 1);
    const mixed = downmixToMono([only]);
    expect(Array.from(mixed)).toEqual([0.25, -0.5, 1]);
    expect(mixed).not.toBe(only);
  });

  it('shares left and right equally', () => {
    const mixed = downmixToMono([Float32Array.of(1, 0, 0.5), Float32Array.of(0, 1, 0.5)]);
    expect(Array.from(mixed)).toEqual([0.5, 0.5, 0.5]);
  });

  it('shares four channels equally', () => {
    expect(downmixToMono([channel(1), channel(1), channel(1), channel(1)])[0]).toBeCloseTo(1, 6);
    expect(downmixToMono([channel(1), channel(0), channel(0), channel(0)])[0]).toBeCloseTo(0.25, 6);
  });

  it('keeps the centre of a surround sound whole (that is where the voices are) and leaves out the bass-only channel', () => {
    const centreOnly = downmixToMono([channel(0), channel(0), channel(0.5), channel(0), channel(0), channel(0)]);
    expect(centreOnly[0]).toBeCloseTo(0.5, 6);
    const bassOnly = downmixToMono([channel(0), channel(0), channel(0), channel(1), channel(0), channel(0)]);
    expect(bassOnly[0]).toBe(0);
  });

  it('mixes every channel of a 5.1 sound in', () => {
    const all = downmixToMono([channel(1), channel(1), channel(1), channel(1), channel(1), channel(1)]);
    expect(all[0]).toBeCloseTo(Math.SQRT2 + 2, 5);
  });

  it('mixes every channel of a 7.1 sound in', () => {
    const all = downmixToMono(Array.from({ length: 8 }, () => channel(1)));
    expect(all[0]).toBeCloseTo(Math.SQRT2 + 3, 5);
  });

  it('shares any other number of channels equally', () => {
    expect(downmixToMono([channel(0.3), channel(0.3), channel(0.3)])[0]).toBeCloseTo(0.3, 6);
    expect(downmixToMono(Array.from({ length: 5 }, () => channel(0.5)))[0]).toBeCloseTo(0.5, 6);
  });

  it('goes as long as the longest channel', () => {
    const mixed = downmixToMono([channel(1, 3), channel(1, 1)]);
    expect(Array.from(mixed)).toEqual([1, 0.5, 0.5]);
  });

  it('gives nothing back for no channels', () => {
    expect(downmixToMono([])).toHaveLength(0);
  });
});

describe('how long a clip or a file can be', () => {
  it('lets a clip be three minutes long', () => {
    expect(MAX_CLIP_SECONDS).toBe(180);
    expect(maxClipFrames(44100)).toBe(180 * 44100);
    expect(maxClipFrames(48000)).toBe(180 * 48000);
  });

  it("never lets a clip be bigger than a sound can be once it is saved, whatever the file's rate", () => {
    const frames = maxClipFrames(192000);
    expect(frames).toBe(Math.floor((MAX_SOUND_BYTES - 44) / 2));
    expect(frames * 2 + 44).toBeLessThanOrEqual(MAX_SOUND_BYTES);
    expect(maxClipFrames(48000) * 2 + 44).toBeLessThanOrEqual(MAX_SOUND_BYTES);
  });

  it('knows when a clip is too long', () => {
    expect(isTooLong(180 * 48000, 48000)).toBe(false);
    expect(isTooLong(180 * 48000 + 1, 48000)).toBe(true);
  });

  it('opens files up to ten minutes and 200 MB', () => {
    expect(MAX_SOURCE_SECONDS).toBe(600);
    expect(maxSourceFrames(48000)).toBe(600 * 48000);
    expect(MAX_SOURCE_BYTES).toBe(200 * 1024 * 1024);
  });
});

describe('the Start handle of a clip', () => {
  const end = 10 * RATE;

  it('goes where it is dragged', () => {
    expect(moveStart(2000, RATE, end)).toEqual({ frame: 2 * RATE, limited: false });
  });

  it("can't come closer to End than the shortest clip that can be saved (100 ms)", () => {
    expect(moveStart(10000, RATE, end)).toEqual({ frame: end - 4800, limited: false });
    expect(moveStart(5000, RATE, 100)).toEqual({ frame: 0, limited: false });
  });

  it("can't go below the very beginning or to nonsense", () => {
    expect(moveStart(-500, RATE, end)).toEqual({ frame: 0, limited: false });
    expect(moveStart(Number.NaN, RATE, end)).toEqual({ frame: 0, limited: false });
  });

  it("can't make a clip longer than three minutes, and says that it was held back", () => {
    const farEnd = 300 * RATE;
    expect(moveStart(0, RATE, farEnd)).toEqual({ frame: 120 * RATE, limited: true });
    expect(moveStart(150_000, RATE, farEnd)).toEqual({ frame: 150 * RATE, limited: false });
  });

  it('is not held back when the clip is exactly three minutes', () => {
    expect(moveStart(120_000, RATE, 300 * RATE)).toEqual({ frame: 120 * RATE, limited: false });
  });
});

describe('the End handle of a clip', () => {
  const total = 300 * RATE;

  it('goes where it is dragged', () => {
    expect(moveEnd(60_000, RATE, 0, total)).toEqual({ frame: 60 * RATE, limited: false });
  });

  it("can't come closer to Start than the shortest clip that can be saved (100 ms)", () => {
    expect(moveEnd(100, RATE, 24000, total)).toEqual({ frame: 28800, limited: false });
    expect(moveEnd(0, RATE, 0, total)).toEqual({ frame: 4800, limited: false });
  });

  it("can't make a clip longer than three minutes, and says that it was held back", () => {
    expect(moveEnd(200_000, RATE, 0, total)).toEqual({ frame: 180 * RATE, limited: true });
    expect(moveEnd(180_000, RATE, 0, total)).toEqual({ frame: 180 * RATE, limited: false });
  });

  it('keeps to the very end when it is pulled all the way there, even when the length is not a whole millisecond', () => {
    const frames = 5 * RATE + 123;
    expect(moveEnd(5002, RATE, 0, frames)).toEqual({ frame: frames, limited: false });
    expect(moveEnd(9999, RATE, 0, frames)).toEqual({ frame: frames, limited: false });
  });

  it("can't go past the end of the file", () => {
    expect(moveEnd(9_999_999, RATE, 250 * RATE, total)).toEqual({ frame: total, limited: false });
  });

  it('says it was held back when pulled to the end of a file that is more than three minutes past Start', () => {
    expect(moveEnd(300_000, RATE, 0, total)).toEqual({ frame: 180 * RATE, limited: true });
  });

  it('treats nonsense as the earliest place it can go', () => {
    expect(moveEnd(Number.NaN, RATE, 0, total)).toEqual({ frame: 4800, limited: false });
  });
});

describe('where a clip starts out', () => {
  it('is from just before the first sound to a little after the last in a short file', () => {
    const samples = join(silence(1), tone(1, 0.5), silence(1));
    expect(startingSelection(samples, RATE)).toEqual({ start: 48000 - 3840, end: 96000 + 9600, long: false });
  });

  it('counts a file of exactly a minute as short', () => {
    const samples = join(silence(1), tone(1, 0.5), silence(58));
    expect(samples).toHaveLength(60 * RATE);
    expect(startingSelection(samples, RATE)).toEqual({ start: 48000 - 3840, end: 96000 + 9600, long: false });
  });

  it('is ten seconds from the first sound in a long file', () => {
    const samples = join(silence(5), tone(30, 0.5), silence(55));
    expect(startingSelection(samples, RATE)).toEqual({ start: 5 * RATE - 3840, end: 5 * RATE - 3840 + 10 * RATE, long: true });
  });

  it('stops at the end of a long file when the first sound is near it', () => {
    const samples = join(silence(65), tone(2, 0.5));
    expect(startingSelection(samples, RATE)).toEqual({ start: 65 * RATE - 3840, end: samples.length, long: true });
  });

  it('is nothing when there is no sound in the file', () => {
    expect(startingSelection(silence(2), RATE)).toBeNull();
    expect(startingSelection(silence(90), RATE)).toBeNull();
    expect(startingSelection(new Float32Array(0), RATE)).toBeNull();
  });
});

describe('zooming in', () => {
  it('is for files longer than five seconds', () => {
    expect(canZoomFile(5 * RATE, RATE)).toBe(false);
    expect(canZoomFile(5 * RATE + 1, RATE)).toBe(true);
  });

  it('shows the clip with half its length of room each side', () => {
    expect(zoomWindow(10 * RATE, 14 * RATE, 60 * RATE, RATE)).toEqual({ from: 8 * RATE, to: 16 * RATE });
  });

  it('gives a very short clip at least a second each side', () => {
    expect(zoomWindow(10 * RATE, 10 * RATE + RATE / 2, 60 * RATE, RATE)).toEqual({ from: 9 * RATE, to: 11 * RATE + RATE / 2 });
  });

  it("doesn't go before the start or past the end of the file", () => {
    expect(zoomWindow(0, 2 * RATE, 3 * RATE, RATE)).toEqual({ from: 0, to: 3 * RATE });
  });

  it('always holds the whole clip', () => {
    const { from, to } = zoomWindow(1234, 56789, 100000, 44100);
    expect(from).toBeLessThanOrEqual(1234);
    expect(to).toBeGreaterThanOrEqual(56789);
  });
});

describe('how far the keys move a handle', () => {
  it('is 50 ms (and 500 ms for Page Up and Down) on a short stretch', () => {
    expect(keyStepsFor(3000)).toEqual({ stepMs: 50, pageMs: 500 });
    expect(keyStepsFor(30_000)).toEqual({ stepMs: 50, pageMs: 500 });
  });

  it('grows with the stretch the slider spans, so a long file can be crossed in a reasonable number of presses', () => {
    expect(keyStepsFor(60_000)).toEqual({ stepMs: 100, pageMs: 1000 });
    expect(keyStepsFor(600_000)).toEqual({ stepMs: 1000, pageMs: 10_000 });
  });
});

describe('naming a clip', () => {
  it('uses the name of its file', () => {
    expect(clipNameFromFile('funny_moment.mp4')).toBe('Funny moment');
    expect(clipNameFromFile('C:\\Videos\\boss-fight.mov')).toBe('Boss fight');
  });

  it('is "My clip" when the file has no name to go by', () => {
    expect(clipNameFromFile('')).toBe('My clip');
    expect(clipNameFromFile('.mp4')).toBe('My clip');
  });
});
