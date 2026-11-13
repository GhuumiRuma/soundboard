import { describe, expect, it } from 'vitest';
import { MODIFIERS, mainKeyFromCode, toGlobalShortcut } from '../keys/keyString';

/**
 * The Tauri global-shortcut plugin passes the text of a sound key on to the Rust library global-hotkey, which only
 * understands the names below. They are copied from parse_key and parse_hotkey in global-hotkey 0.8.0, the version
 * in src-tauri/Cargo.lock. A key the app lets someone pick but this list lacks would only be refused at the very
 * last step, on someone's computer, so every key the app can make is checked against the list here.
 * After a Cargo.lock update, compare the list with hotkey.rs in the new version.
 */
const KEY_NAMES = new Set([
  ...[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].flatMap((letter) => [`KEY${letter}`, letter]),
  ...Array.from({ length: 10 }, (_, d) => [`DIGIT${d}`, `${d}`, `NUMPAD${d}`, `NUM${d}`]).flat(),
  ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
  ...['BACKQUOTE', 'BACKSLASH', 'BRACKETLEFT', 'BRACKETRIGHT', 'COMMA', 'EQUAL', 'MINUS', 'PERIOD', 'QUOTE', 'SEMICOLON', 'SLASH'],
  ...['`', '\\', '[', ']', ',', '=', '-', '.', "'", ';', '/'],
  ...['PAUSE', 'PAUSEBREAK', 'BACKSPACE', 'CAPSLOCK', 'ENTER', 'SPACE', 'TAB', 'DELETE', 'END', 'HOME', 'INSERT'],
  ...['PAGEDOWN', 'PAGEUP', 'PRINTSCREEN', 'SCROLLLOCK', 'NUMLOCK', 'ESCAPE', 'ESC'],
  ...['ARROWDOWN', 'DOWN', 'ARROWLEFT', 'LEFT', 'ARROWRIGHT', 'RIGHT', 'ARROWUP', 'UP'],
  ...['NUMPADADD', 'NUMADD', 'NUMPADPLUS', 'NUMPLUS', 'NUMPADDECIMAL', 'NUMDECIMAL', 'NUMPADDIVIDE', 'NUMDIVIDE'],
  ...['NUMPADENTER', 'NUMENTER', 'NUMPADEQUAL', 'NUMEQUAL', 'NUMPADMULTIPLY', 'NUMMULTIPLY', 'NUMPADSUBTRACT', 'NUMSUBTRACT'],
  ...['AUDIOVOLUMEDOWN', 'VOLUMEDOWN', 'AUDIOVOLUMEUP', 'VOLUMEUP', 'AUDIOVOLUMEMUTE', 'VOLUMEMUTE'],
  ...['MEDIAPLAY', 'MEDIAPAUSE', 'MEDIAPLAYPAUSE', 'MEDIASTOP', 'MEDIATRACKNEXT', 'MEDIATRACKPREV', 'MEDIATRACKPREVIOUS'],
]);

const MODIFIER_NAMES = new Set(['OPTION', 'ALT', 'CONTROL', 'CTRL', 'COMMAND', 'CMD', 'SUPER', 'SHIFT']);

type Reading = { ok: true; modifiers: string[]; key: string } | { ok: false; why: string };

/** Reads a shortcut the way global-hotkey does: modifiers first, then exactly one main key. */
function readLikeGlobalHotkey(text: string): Reading {
  const tokens = text.split('+');
  const isKey = (name: string) => KEY_NAMES.has(name.toUpperCase());
  if (tokens.length === 1) return isKey(text) ? { ok: true, modifiers: [], key: text } : { ok: false, why: `unsupported key "${text}"` };

  const modifiers: string[] = [];
  let key: string | null = null;
  for (const raw of tokens) {
    const token = raw.trim();
    if (token === '') return { ok: false, why: 'empty token' };
    if (key !== null) return { ok: false, why: 'more than one main key, or the key is not last' };
    if (MODIFIER_NAMES.has(token.toUpperCase())) modifiers.push(token.toUpperCase());
    else if (isKey(token)) key = token;
    else return { ok: false, why: `unsupported key "${token}"` };
  }
  return key === null ? { ok: false, why: 'no main key' } : { ok: true, modifiers, key };
}

// Every KeyboardEvent.code in the UI Events specification, plus the F13 to F24 that some keyboards have.
const CODES = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => `Key${c}`),
  ...'0123456789'.split('').flatMap((d) => [`Digit${d}`, `Numpad${d}`]),
  ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
  ...['Backquote', 'Backslash', 'BracketLeft', 'BracketRight', 'Comma', 'Equal', 'IntlBackslash', 'IntlRo', 'IntlYen'],
  ...['Minus', 'Period', 'Quote', 'Semicolon', 'Slash'],
  ...['AltLeft', 'AltRight', 'Backspace', 'CapsLock', 'ContextMenu', 'ControlLeft', 'ControlRight', 'Enter', 'MetaLeft', 'MetaRight'],
  ...['ShiftLeft', 'ShiftRight', 'Space', 'Tab', 'Convert', 'KanaMode', 'Lang1', 'Lang2', 'Lang3', 'Lang4', 'Lang5', 'NonConvert'],
  ...['Delete', 'End', 'Help', 'Home', 'Insert', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'],
  ...['NumLock', 'NumpadAdd', 'NumpadBackspace', 'NumpadClear', 'NumpadClearEntry', 'NumpadComma', 'NumpadDecimal', 'NumpadDivide'],
  ...['NumpadEnter', 'NumpadEqual', 'NumpadHash', 'NumpadMemoryAdd', 'NumpadMemoryClear', 'NumpadMemoryRecall', 'NumpadMemoryStore'],
  ...['NumpadMemorySubtract', 'NumpadMultiply', 'NumpadParenLeft', 'NumpadParenRight', 'NumpadStar', 'NumpadSubtract'],
  ...['Escape', 'Fn', 'FnLock', 'PrintScreen', 'ScrollLock', 'Pause', 'AltGraph', 'OSLeft', 'OSRight'],
  ...['BrowserBack', 'BrowserFavorites', 'BrowserForward', 'BrowserHome', 'BrowserRefresh', 'BrowserSearch', 'BrowserStop'],
  ...['Eject', 'LaunchApp1', 'LaunchApp2', 'LaunchMail', 'MediaPlayPause', 'MediaSelect', 'MediaStop', 'MediaTrackNext'],
  ...['MediaTrackPrevious', 'Power', 'Sleep', 'AudioVolumeDown', 'AudioVolumeMute', 'AudioVolumeUp', 'WakeUp'],
];

const modifierCombinations = Array.from({ length: 1 << MODIFIERS.length }, (_, bits) => MODIFIERS.filter((_m, i) => bits & (1 << i)));

describe('The reader of shortcuts used by these tests', () => {
  it('accepts what global-hotkey accepts', () => {
    expect(readLikeGlobalHotkey('Ctrl+Alt+1')).toEqual({ ok: true, modifiers: ['CTRL', 'ALT'], key: '1' });
    expect(readLikeGlobalHotkey('Super+Shift+NumpadAdd')).toEqual({ ok: true, modifiers: ['SUPER', 'SHIFT'], key: 'NumpadAdd' });
    expect(readLikeGlobalHotkey('F13')).toMatchObject({ ok: true });
    expect(readLikeGlobalHotkey('ctrl + KeyX')).toMatchObject({ ok: true });
  });

  it('refuses what global-hotkey refuses, so passing it means something', () => {
    for (const text of ['', 'Ctrl', 'Ctrl+', 'Ctrl+Alt', 'Ctrl+A+B', 'A+Ctrl', 'Ctrl+Plus', 'Ctrl+Meta+A', 'Hyper+A', 'F25', 'Ctrl+Alt+Esc+1']) {
      expect(readLikeGlobalHotkey(text), text).toMatchObject({ ok: false });
    }
  });
});

describe('Sound keys the desktop app registers', () => {
  it('are names global-hotkey knows, for every key the app can make with every combination of modifier keys', () => {
    const keys = CODES.map(mainKeyFromCode).filter((key): key is string => key !== null);
    for (const key of ['A', 'Z', '0', '9', 'F1', 'F24', 'Numpad0', 'Numpad9', 'Up', 'Space', 'Comma', 'Backslash']) {
      expect(keys, key).toContain(key);
    }
    expect(keys.length).toBeGreaterThanOrEqual(90);

    const refused: string[] = [];
    for (const key of keys) {
      for (const held of modifierCombinations) {
        const text = [...held, key].join('+');
        const shortcut = toGlobalShortcut(text);
        const reading = shortcut === null ? null : readLikeGlobalHotkey(shortcut);
        if (!reading?.ok) refused.push(`${text} -> ${shortcut}${reading && !reading.ok ? ` (${reading.why})` : ''}`);
      }
    }
    expect(refused).toEqual([]);
  });

  it('read the modifier keys the way the plugin does, with Meta called Super', () => {
    expect(toGlobalShortcut('Ctrl+Alt+Shift+Meta+F13')).toBe('Ctrl+Alt+Shift+Super+F13');
    expect(readLikeGlobalHotkey('Ctrl+Alt+Shift+Super+F13')).toEqual({ ok: true, modifiers: ['CTRL', 'ALT', 'SHIFT', 'SUPER'], key: 'F13' });
  });

  it('are also fine when written another way, because they are tidied up first', () => {
    const cases: [string, string][] = [
      ['control + option + 1', 'Ctrl+Alt+1'],
      ['Ctrl+Del', 'Ctrl+Delete'],
      ['Alt+PgUp', 'Alt+PageUp'],
      ['Num 5', 'Numpad5'],
      ['Win+Q', 'Super+Q'],
      ['cmd+shift+F13', 'Shift+Super+F13'],
      ['Ctrl+,', 'Ctrl+Comma'],
      ['Ctrl+Alt+Numpad Enter', 'Ctrl+Alt+NumpadEnter'],
      ['shift+arrowup', 'Shift+Up'],
      ['ctrl+-', 'Ctrl+Minus'],
    ];
    for (const [written, expected] of cases) {
      const shortcut = toGlobalShortcut(written);
      expect(shortcut, written).toBe(expected);
      expect(readLikeGlobalHotkey(shortcut as string), written).toMatchObject({ ok: true });
    }
  });

  it('are never made from text that is not a key', () => {
    for (const text of ['', 'Ctrl', 'Ctrl+Alt', 'banana', 'Ctrl+A+B', 'Ctrl+Plus']) expect(toGlobalShortcut(text), text).toBeNull();
  });
});
