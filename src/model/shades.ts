/**
 * Shades for a sound button, ported from StreamStudio's SoundboardWindowPresenter.Shades.
 * Nothing on a button is lighter than MAX_SHADE_LUMINANCE, so its white name and its key text keep a contrast of at
 * least 4.5:1 whatever colour she picked. A light colour (white, yellow) is darkened further.
 */
import { sanitizeColor } from './rules';

/** How light the lightest part of a button may be (WCAG relative luminance). */
export const MAX_SHADE_LUMINANCE = 0.14;

/** The colour of the key text on a button. The name is white. */
export const KEY_TEXT_COLOR = '#EEE8F8';

export interface Shades {
  top: string;
  bottom: string;
  border: string;
}

// .NET rounds halves to the nearest even number, so do the same to get the same colours.
function roundHalfEven(value: number): number {
  const rounded = Math.round(value);
  return Math.abs(value % 1) === 0.5 && rounded % 2 !== 0 ? rounded - 1 : rounded;
}

const channel = (value: number) => Math.min(255, Math.max(0, roundHalfEven(value)));

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => channel(v).toString(16).toUpperCase().padStart(2, '0')).join('');

function linear(channelValue: number): number {
  const c = channelValue / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** How light a colour looks (WCAG relative luminance), as it will be drawn. */
function drawnLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linear(channel(r)) + 0.7152 * linear(channel(g)) + 0.0722 * linear(channel(b));
}

/** The top, bottom and border colours of a button, as #RRGGBB. */
export function shades(color: string | null | undefined): Shades {
  const rgb = parseInt(sanitizeColor(color).slice(1), 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  let darker = 1;
  while (darker > 0.05 && drawnLuminance(r * 0.72 * darker, g * 0.72 * darker, b * 0.72 * darker) > MAX_SHADE_LUMINANCE) {
    darker *= 0.95;
  }
  return {
    top: hex(r * 0.72 * darker, g * 0.72 * darker, b * 0.72 * darker),
    bottom: hex(r * 0.42 * darker, g * 0.42 * darker, b * 0.42 * darker),
    border: hex(r * 0.65 + 255 * 0.35, g * 0.65 + 255 * 0.35, b * 0.65 + 255 * 0.35),
  };
}
