import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from '../test/contrast';
import { PALETTE } from './rules';
import { KEY_TEXT_COLOR, MAX_SHADE_LUMINANCE, shades } from './shades';

describe('shades', () => {
  it('matches StreamStudio for the default purple', () => {
    expect(shades('#7C3AED')).toEqual({ top: '#592AAB', bottom: '#341864', border: '#AA7FF3' });
  });

  it('reads the colour the way the rest of the app does', () => {
    expect(shades('#7c3aed')).toEqual(shades('#7C3AED'));
    expect(shades('nonsense')).toEqual(shades('#7C3AED'));
    expect(shades(undefined)).toEqual(shades('#7C3AED'));
  });

  it('rounds halves to the even number like StreamStudio does', () => {
    // 25 x 0.42 is exactly 10.5, which becomes 10, not 11.
    expect(shades('#190000').bottom).toBe('#0A0000');
  });

  it('keeps white text readable (4.5:1) on every colour in the palette', () => {
    for (const color of PALETTE) {
      const { top, bottom } = shades(color);
      expect(contrastRatio('#FFFFFF', top), color).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio('#FFFFFF', bottom), color).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the key text readable (4.5:1) on every colour in the palette', () => {
    for (const color of PALETTE) {
      const { top, bottom } = shades(color);
      expect(contrastRatio(KEY_TEXT_COLOR, top), color).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(KEY_TEXT_COLOR, bottom), color).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps both readable on any colour she could pick, even white and yellow', () => {
    const steps = [0, 51, 102, 153, 204, 255, 17, 85, 170, 238];
    const colours = ['#FFFFFF', '#FFFF00', '#FFD700', '#00FF00', '#00FFFF', '#000000'];
    for (const r of steps) for (const g of steps) for (const b of steps) {
      colours.push('#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''));
    }
    for (const color of colours) {
      const { top } = shades(color);
      expect(contrastRatio('#FFFFFF', top), color).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(KEY_TEXT_COLOR, top), color).toBeGreaterThanOrEqual(4.5);
      expect(relativeLuminance(top), color).toBeLessThanOrEqual(MAX_SHADE_LUMINANCE + 1e-9);
    }
  });

  it('makes the bottom darker than the top and the border lighter', () => {
    for (const color of PALETTE) {
      const { top, bottom, border } = shades(color);
      expect(relativeLuminance(bottom)).toBeLessThan(relativeLuminance(top));
      expect(relativeLuminance(border)).toBeGreaterThan(relativeLuminance(top));
    }
  });

  it('writes capital #RRGGBB', () => {
    for (const color of PALETTE) {
      const s = shades(color);
      expect(s.top).toMatch(/^#[0-9A-F]{6}$/);
      expect(s.bottom).toMatch(/^#[0-9A-F]{6}$/);
      expect(s.border).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
