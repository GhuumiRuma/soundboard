import { describe, expect, it } from 'vitest';
import { plural } from './plural';

describe('plural', () => {
  it('says one thing in the singular', () => {
    expect(plural(1, 'sound')).toBe('1 sound');
    expect(plural(1, 'board')).toBe('1 board');
  });

  it('says anything else in the plural, including none', () => {
    expect(plural(0, 'sound')).toBe('0 sounds');
    expect(plural(2, 'sound')).toBe('2 sounds');
    expect(plural(12, 'board')).toBe('12 boards');
  });

  it('uses the plural it is given', () => {
    expect(plural(2, 'copy', 'copies')).toBe('2 copies');
    expect(plural(1, 'copy', 'copies')).toBe('1 copy');
  });
});
