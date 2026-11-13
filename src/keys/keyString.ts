import type { DeviceOs } from '../lib/device';

/**
 * Sound keys are written like "Ctrl+Alt+1": modifiers in the order Ctrl, Alt, Shift, Meta, then one main key.
 * Main keys are named after KeyboardEvent.code, so they mean the same key on every keyboard layout.
 */
export type Modifier = 'Ctrl' | 'Alt' | 'Shift' | 'Meta';
export const MODIFIERS: readonly Modifier[] = ['Ctrl', 'Alt', 'Shift', 'Meta'];

export const NOT_SET = 'Not set';

const NAMED: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Space: 'Space',
  Minus: 'Minus',
  Equal: 'Equal',
  Comma: 'Comma',
  Period: 'Period',
  Slash: 'Slash',
  Semicolon: 'Semicolon',
  Quote: 'Quote',
  Backquote: 'Backquote',
  BracketLeft: 'BracketLeft',
  BracketRight: 'BracketRight',
  Backslash: 'Backslash',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  Delete: 'Delete',
  NumpadAdd: 'NumpadAdd',
  NumpadSubtract: 'NumpadSubtract',
  NumpadMultiply: 'NumpadMultiply',
  NumpadDivide: 'NumpadDivide',
  NumpadDecimal: 'NumpadDecimal',
  NumpadEnter: 'NumpadEnter',
};

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
  'AltGraph',
]);

/** The main-key name for a KeyboardEvent.code, or null when that key can't be a sound key. */
export function mainKeyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (/^Numpad[0-9]$/.test(code)) return code;
  return NAMED[code] ?? null;
}

// ---- Reading what someone typed or saved ----

const LOOKUP = new Map<string, string>();
const squash = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');

function addKey(canonical: string, ...aliases: string[]) {
  LOOKUP.set(squash(canonical), canonical);
  for (const a of aliases) LOOKUP.set(squash(a), canonical);
}
for (let c = 65; c <= 90; c++) addKey(String.fromCharCode(c));
for (let d = 0; d <= 9; d++) {
  addKey(String(d));
  addKey(`Numpad${d}`, `Num${d}`, `Num ${d}`, `Numpad ${d}`);
}
for (let f = 1; f <= 24; f++) addKey(`F${f}`);
addKey('Up', 'ArrowUp');
addKey('Down', 'ArrowDown');
addKey('Left', 'ArrowLeft');
addKey('Right', 'ArrowRight');
addKey('Space', 'Spacebar');
addKey('Home');
addKey('End');
addKey('PageUp', 'PgUp', 'Page Up');
addKey('PageDown', 'PgDn', 'Page Down');
addKey('Insert', 'Ins');
addKey('Delete', 'Del');
addKey('NumpadAdd', 'NumAdd', 'NumpadPlus');
addKey('NumpadSubtract', 'NumSubtract', 'NumpadMinus');
addKey('NumpadMultiply', 'NumMultiply');
addKey('NumpadDivide', 'NumDivide');
addKey('NumpadDecimal', 'NumDecimal');
addKey('NumpadEnter', 'NumEnter', 'Numpad Enter');
addKey('Minus');
addKey('Equal');
addKey('Comma');
addKey('Period');
addKey('Slash');
addKey('Semicolon');
addKey('Quote');
addKey('Backquote');
addKey('BracketLeft');
addKey('BracketRight');
addKey('Backslash');

// Characters that stand for punctuation keys. "-" can't go through squash(), which treats it as a separator.
const PUNCTUATION: Record<string, string> = {
  '-': 'Minus',
  '=': 'Equal',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  ';': 'Semicolon',
  "'": 'Quote',
  '`': 'Backquote',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
};

const MODIFIER_NAMES: Record<string, Modifier> = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  ctl: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  opt: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  cmd: 'Meta',
  command: 'Meta',
  win: 'Meta',
  windows: 'Meta',
  super: 'Meta',
};

export interface ParsedKey {
  modifiers: Modifier[];
  key: string;
}

/** Reads "ctrl + alt + 1", "Control+Option+Numpad 1" and the like. Returns null unless there is exactly one main key. */
export function parseKeyString(input: string | null | undefined): ParsedKey | null {
  if (!input) return null;
  const parts = input
    .split('+')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (parts.length === 0) return null;
  const held = new Set<Modifier>();
  let key: string | null = null;
  for (const part of parts) {
    const modifier = MODIFIER_NAMES[squash(part)];
    if (modifier) {
      held.add(modifier);
      continue;
    }
    const main = PUNCTUATION[part] ?? LOOKUP.get(squash(part));
    if (!main || key !== null) return null;
    key = main;
  }
  if (key === null) return null;
  return { modifiers: MODIFIERS.filter((m) => held.has(m)), key };
}

/** The one spelling every saved key uses, or null when the text isn't a usable key. */
export function normalizeKeyString(input: string | null | undefined): string | null {
  const parsed = parseKeyString(input);
  return parsed ? [...parsed.modifiers, parsed.key].join('+') : null;
}

// ---- Reading a key press ----

export interface KeyEventLike {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export type KeyCapture =
  | { kind: 'key'; key: string }
  | { kind: 'modifiers'; held: Modifier[] }
  | { kind: 'unsupported' };

export function heldModifiers(e: Pick<KeyEventLike, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): Modifier[] {
  const held: Modifier[] = [];
  if (e.ctrlKey) held.push('Ctrl');
  if (e.altKey) held.push('Alt');
  if (e.shiftKey) held.push('Shift');
  if (e.metaKey) held.push('Meta');
  return held;
}

/** What a key press means as a sound key: a finished key, modifiers still being held, or a key that can't be used. */
export function captureKey(e: KeyEventLike): KeyCapture {
  if (MODIFIER_CODES.has(e.code)) return { kind: 'modifiers', held: heldModifiers(e) };
  const main = mainKeyFromCode(e.code);
  if (!main) return { kind: 'unsupported' };
  return { kind: 'key', key: [...heldModifiers(e), main].join('+') };
}

// ---- Showing a key ----

const SYMBOLS: Record<string, string> = {
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  NumpadAdd: 'Numpad +',
  NumpadSubtract: 'Numpad -',
  NumpadMultiply: 'Numpad *',
  NumpadDivide: 'Numpad /',
  NumpadDecimal: 'Numpad .',
  NumpadEnter: 'Numpad Enter',
};

export function modifierLabel(m: Modifier, os: DeviceOs = 'other'): string {
  if (m === 'Meta') return os === 'mac' || os === 'ios' ? 'Cmd' : os === 'windows' ? 'Win' : 'Meta';
  if (m === 'Alt') return os === 'mac' || os === 'ios' ? 'Option' : 'Alt';
  return m;
}

export function mainKeyLabel(key: string): string {
  const numpad = /^Numpad([0-9])$/.exec(key);
  if (numpad) return `Numpad ${numpad[1]}`;
  return SYMBOLS[key] ?? key;
}

/** "Ctrl + Alt + 1", or "Not set" when there is no key. */
export function formatKey(key: string | null | undefined, os: DeviceOs = 'other'): string {
  const parsed = parseKeyString(key);
  if (!parsed) return NOT_SET;
  return [...parsed.modifiers.map((m) => modifierLabel(m, os)), mainKeyLabel(parsed.key)].join(' + ');
}

/** Text for the modifiers being held while she presses the rest of the key, like "Ctrl + Alt + …". */
export function formatHeld(held: readonly Modifier[], os: DeviceOs = 'other'): string {
  return [...held.map((m) => modifierLabel(m, os)), '…'].join(' + ');
}

// ---- Warnings ----

const SAFE_WITHOUT_MODIFIER = /^(F(1[3-9]|2[0-4])|Numpad.*)$/;

/**
 * Advice about a key that is valid but easy to regret: nothing but a plain key or Shift, which people press all the time.
 * Function keys F13 to F24 and the number pad are fine on their own.
 */
export function keyWarning(key: string, where: { global: boolean }): string | null {
  const parsed = parseKeyString(key);
  if (!parsed) return null;
  const strong = parsed.modifiers.some((m) => m === 'Ctrl' || m === 'Alt' || m === 'Meta');
  if (strong || SAFE_WITHOUT_MODIFIER.test(parsed.key)) return null;
  return where.global
    ? "While your sound keys are on, games and other apps won't get this key. Ctrl + Alt + a number is a safer choice."
    : 'This key plays the sound whenever you press it here, so it is easy to hit by mistake. Ctrl + Alt + a number is a safer choice.';
}

const BROWSER_KEYS = new Set([
  'Ctrl+W',
  'Ctrl+T',
  'Ctrl+N',
  'Ctrl+Shift+N',
  'Ctrl+Shift+T',
  'Ctrl+Shift+W',
  'Ctrl+PageUp',
  'Ctrl+PageDown',
  'Ctrl+R',
  'Ctrl+L',
  'Ctrl+Q',
  'Alt+F4',
  'Alt+Left',
  'Alt+Right',
  'Meta+W',
  'Meta+T',
  'Meta+N',
  'Meta+Q',
  'Meta+R',
  'Meta+L',
  'F5',
  'F11',
  'F12',
  ...Array.from({ length: 9 }, (_, i) => `Ctrl+${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `Meta+${i + 1}`),
]);

/** Keys that browsers keep for themselves, so a web page can't catch them. */
export function isBrowserKey(key: string): boolean {
  const normalized = normalizeKeyString(key);
  return normalized !== null && BROWSER_KEYS.has(normalized);
}

/** A saved key as the Tauri global-shortcut plugin reads it: Meta becomes "Super", everything else is spelled the same. */
export function toGlobalShortcut(key: string): string | null {
  const parsed = parseKeyString(key);
  if (!parsed) return null;
  const modifiers = parsed.modifiers.map((m) => (m === 'Meta' ? 'Super' : m));
  return [...modifiers, parsed.key].join('+');
}
