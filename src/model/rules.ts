/**
 * The rules that keep names, emoji, colours and volumes tidy, whether she typed them or a backup holds them.
 * Ported from StreamStudio's SoundboardWindowPresenter (Plain, Emoji, Color) and StudioService.Normalize.
 */

/** Longest name shown on a button or a board. A longer one is cut and ends in "…". */
export const MAX_NAME_LENGTH = 48;

export const DEFAULT_BOARD_NAME = 'Soundboard';
export const DEFAULT_SOUND_NAME = 'Sound';
/** What her very first board is called. */
export const FIRST_BOARD_NAME = 'My sounds';
export const NEW_BOARD_NAME = 'New board';

export const DEFAULT_COLOR = '#7C3AED';
export const DEFAULT_EMOJI = '🔊';
export const DEFAULT_VOLUME = 0.8;

/** The colours to pick from. New sounds go through them in order. */
export const PALETTE: readonly string[] = [
  '#7C3AED',
  '#DB2777',
  '#2563EB',
  '#059669',
  '#EA580C',
  '#DC2626',
  '#0891B2',
  '#9333EA',
];

/** The emoji to pick from. New sounds go through them in order. */
export const EMOJIS: readonly string[] = [
  '🔊', '🎵', '🎉', '👏', '😂', '😱', '🔥', '✨', '💅', '👀', '💖', '🚨',
  '🥁', '🎺', '📣', '💥', '🐱', '🐶', '👑', '🪩', '🍾', '💸', '🫶', '⭐',
];

const CONTROL = /\p{Cc}/u;
// The same characters .NET counts as white space, so names come out the same as in StreamStudio.
const WHITE_SPACE = /[\p{Zs}\p{Zl}\p{Zp}\t\n\v\f\r\u0085]/u;
const EDGE_SPACE = /^[\p{Zs}\p{Zl}\p{Zp}\t\n\v\f\r\u0085]+|[\p{Zs}\p{Zl}\p{Zp}\t\n\v\f\r\u0085]+$/gu;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function trim(text: string): string {
  return text.replace(EDGE_SPACE, '');
}

/** The characters she sees one by one. An emoji with a skin tone, or a letter with an accent, counts as one. */
export function graphemes(text: string): string[] {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter) {
    return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

/** A name on one line, without control characters, cut short with "…" when it's long; the fallback when it's empty. */
export function plainName(text: unknown, fallback: string): string {
  if (typeof text !== 'string') return fallback;
  const trimmed = trim(text);
  if (trimmed === '') return fallback;

  let plain = '';
  let space = false;
  for (const ch of trimmed) {
    if (CONTROL.test(ch) || WHITE_SPACE.test(ch)) {
      space = plain.length > 0;
      continue;
    }
    if (space) {
      plain += ' ';
      space = false;
    }
    plain += ch;
    if (plain.length > MAX_NAME_LENGTH) break;
  }

  if (plain.length === 0) return fallback;
  if (plain.length <= MAX_NAME_LENGTH) return plain;

  // Cut on whole characters as she sees them, so an emoji or an accent isn't split.
  let cut = '';
  for (const piece of graphemes(plain)) {
    if (cut.length + piece.length > MAX_NAME_LENGTH - 1) break;
    cut += piece;
  }
  return trimEnd(cut) + '…';
}

function trimEnd(text: string): string {
  return text.replace(/[\p{Zs}\p{Zl}\p{Zp}\t\n\v\f\r\u0085]+$/u, '');
}

export const sanitizeBoardName = (name: unknown): string => plainName(name, DEFAULT_BOARD_NAME);
export const sanitizeSoundName = (name: unknown): string => plainName(name, DEFAULT_SOUND_NAME);

/** A button's emoji: at most two characters as she sees them, or the speaker when there's none. */
export function sanitizeEmoji(emoji: unknown): string {
  if (typeof emoji !== 'string') return DEFAULT_EMOJI;
  const text = trim(emoji);
  if (text === '' || CONTROL.test(text)) return DEFAULT_EMOJI;
  const pieces = graphemes(text);
  return pieces.length <= 2 ? text : pieces.slice(0, 2).join('');
}

/** A button's colour as #RRGGBB in capitals, or the soundboard's purple when it isn't one. */
export function sanitizeColor(color: unknown): string {
  if (typeof color !== 'string') return DEFAULT_COLOR;
  const text = trim(color);
  return HEX_COLOR.test(text) ? text.toUpperCase() : DEFAULT_COLOR;
}

/** A number from 0 to 1. Anything that isn't a number becomes the fallback. */
export function clamp01(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

/** A sound's volume, 0 to 1. A missing one starts at 80%. */
export const sanitizeVolume = (volume: unknown): number => clamp01(volume, DEFAULT_VOLUME);

/** The volume of every sound at once, 0 to 1. A missing one is full. */
export const sanitizeMasterVolume = (volume: unknown): number => clamp01(volume, 1);

/** A name for a new sound from the name of its file: "air_horn-2.mp3" becomes "Air horn 2". */
export function soundNameFromFile(fileName: string): string {
  const slash = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'));
  let name = slash >= 0 ? fileName.slice(slash + 1) : fileName;
  const dot = name.lastIndexOf('.');
  if (dot > 0) name = name.slice(0, dot);
  else if (dot === 0) name = '';
  const words = name.replace(/[_-]/g, ' ').split(' ').filter((w) => w.trim() !== '');
  const text = words.join(' ').trim();
  if (text === '') return 'New sound';
  const [first] = text;
  const upper = first.toUpperCase();
  return plainName((upper.length === first.length ? upper : first) + text.slice(first.length), 'New sound');
}
