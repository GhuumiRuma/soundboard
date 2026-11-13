import { describe, expect, it } from 'vitest';
import { effectiveGain, gainFor, toPercent } from './volume';

describe('volume maths', () => {
  it('keeps a volume between silent and full', () => {
    expect(gainFor(0.5)).toBe(0.5);
    expect(gainFor(-1)).toBe(0);
    expect(gainFor(3)).toBe(1);
    expect(gainFor(Number.NaN)).toBe(0);
  });

  it('multiplies the sound volume by the master volume', () => {
    expect(effectiveGain(0.8, 1)).toBeCloseTo(0.8);
    expect(effectiveGain(0.8, 0.5)).toBeCloseTo(0.4);
    expect(effectiveGain(1, 0)).toBe(0);
    expect(effectiveGain(2, 2)).toBe(1);
  });

  it('shows a volume as a whole percentage', () => {
    expect(toPercent(0.8)).toBe(80);
    expect(toPercent(0.333)).toBe(33);
    expect(toPercent(1.5)).toBe(100);
    expect(toPercent(-0.2)).toBe(0);
  });
});
