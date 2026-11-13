import { describe, expect, it } from 'vitest';
import {
  captureKey,
  eventCode,
  formatHeld,
  formatKey,
  isBrowserKey,
  keyWarning,
  mainKeyFromCode,
  normalizeKeyString,
  parseKeyString,
  safeKeyAdvice,
  toGlobalShortcut,
  type KeyEventLike,
} from './keyString';

const press = (code: string, mods: Partial<Omit<KeyEventLike, 'code'>> = {}): KeyEventLike => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe('normalizeKeyString', () => {
  it('puts modifiers in the same order and spells the key one way', () => {
    expect(normalizeKeyString('ctrl+alt+1')).toBe('Ctrl+Alt+1');
    expect(normalizeKeyString('Shift+Ctrl+a')).toBe('Ctrl+Shift+A');
    expect(normalizeKeyString('  Alt + Ctrl + Shift + F5 ')).toBe('Ctrl+Alt+Shift+F5');
  });

  it('understands other names for the same key', () => {
    expect(normalizeKeyString('Control+Option+Num 1')).toBe('Ctrl+Alt+Numpad1');
    expect(normalizeKeyString('cmd+ArrowUp')).toBe('Meta+Up');
    expect(normalizeKeyString('Win+PgDn')).toBe('Meta+PageDown');
    expect(normalizeKeyString('Super+Del')).toBe('Meta+Delete');
    expect(normalizeKeyString('Ctrl+-')).toBe('Ctrl+Minus');
    expect(normalizeKeyString('Ctrl+[')).toBe('Ctrl+BracketLeft');
  });

  it('counts a repeated modifier once', () => {
    expect(normalizeKeyString('Ctrl+Control+B')).toBe('Ctrl+B');
  });

  it('keeps a key that is already tidy exactly as it is', () => {
    for (const key of ['Ctrl+Shift+1', 'F13', 'Numpad5', 'Ctrl+Alt+NumpadAdd', 'Alt+Space', 'Shift+Meta+Backslash']) {
      expect(normalizeKeyString(key)).toBe(key);
    }
  });

  it('turns down text that is not a key', () => {
    for (const bad of ['', '   ', 'Ctrl', 'Ctrl+Alt', 'Ctrl+', '+', 'A+B', 'Ctrl+Banana', 'Escape', 'Ctrl+Enter', 'Tab']) {
      expect(normalizeKeyString(bad)).toBeNull();
    }
    expect(normalizeKeyString(null)).toBeNull();
    expect(normalizeKeyString(undefined)).toBeNull();
  });
});

describe('parseKeyString', () => {
  it('splits a key into its modifiers and main key', () => {
    expect(parseKeyString('Ctrl+Alt+7')).toEqual({ modifiers: ['Ctrl', 'Alt'], key: '7' });
    expect(parseKeyString('F20')).toEqual({ modifiers: [], key: 'F20' });
  });
});

describe('captureKey', () => {
  it('turns a key press into a saved key', () => {
    expect(captureKey(press('Digit1', { ctrlKey: true, shiftKey: true }))).toEqual({ kind: 'key', key: 'Ctrl+Shift+1' });
    expect(captureKey(press('KeyA', { altKey: true }))).toEqual({ kind: 'key', key: 'Alt+A' });
    expect(captureKey(press('Numpad3'))).toEqual({ kind: 'key', key: 'Numpad3' });
    expect(captureKey(press('F13'))).toEqual({ kind: 'key', key: 'F13' });
    expect(captureKey(press('ArrowLeft', { metaKey: true }))).toEqual({ kind: 'key', key: 'Meta+Left' });
  });

  it('uses the key that was pressed, not the letter it makes on this keyboard', () => {
    // On a French keyboard the key labelled "A" reports code "KeyQ"; the saved key follows the code.
    expect(captureKey(press('KeyQ', { ctrlKey: true }))).toEqual({ kind: 'key', key: 'Ctrl+Q' });
  });

  it('waits while only modifier keys are held', () => {
    expect(captureKey(press('ControlLeft', { ctrlKey: true }))).toEqual({ kind: 'modifiers', held: ['Ctrl'] });
    expect(captureKey(press('ShiftRight', { ctrlKey: true, shiftKey: true }))).toEqual({
      kind: 'modifiers',
      held: ['Ctrl', 'Shift'],
    });
  });

  it('says so when a key cannot be a sound key', () => {
    for (const code of ['Escape', 'Tab', 'Enter', 'Backspace', 'CapsLock', 'PrintScreen', 'ContextMenu', 'Unidentified']) {
      expect(captureKey(press(code))).toEqual({ kind: 'unsupported' });
    }
  });

  it('reads keys that another program sends without a key code, such as a Stream Deck', () => {
    expect(captureKey(press('', { key: 'a', ctrlKey: true, altKey: true }))).toEqual({ kind: 'key', key: 'Ctrl+Alt+A' });
    expect(captureKey(press('', { key: '7', ctrlKey: true }))).toEqual({ kind: 'key', key: 'Ctrl+7' });
    expect(captureKey(press('', { key: 'F14' }))).toEqual({ kind: 'key', key: 'F14' });
    expect(captureKey(press('', { key: ' ', ctrlKey: true }))).toEqual({ kind: 'key', key: 'Ctrl+Space' });
    expect(captureKey(press('', { key: 'Control', ctrlKey: true }))).toEqual({ kind: 'modifiers', held: ['Ctrl'] });
    expect(captureKey(press('', { key: '?' }))).toEqual({ kind: 'unsupported' });
    expect(captureKey(press(''))).toEqual({ kind: 'unsupported' });
  });

  it('trusts the key code when there is one', () => {
    expect(captureKey(press('Digit1', { key: '!', shiftKey: true, ctrlKey: true }))).toEqual({ kind: 'key', key: 'Ctrl+Shift+1' });
  });
});

describe('eventCode', () => {
  it('uses the code, or the key name when there is no code', () => {
    expect(eventCode({ code: 'KeyB', key: 'b' })).toBe('KeyB');
    expect(eventCode({ code: '', key: 'Escape' })).toBe('Escape');
    expect(eventCode({ code: '', key: 'Backspace' })).toBe('Backspace');
    expect(eventCode({ code: '', key: 'Dead' })).toBe('');
    expect(eventCode({ code: '' })).toBe('');
  });
});

describe('mainKeyFromCode', () => {
  it('covers letters, digits, function keys and the number pad', () => {
    expect(mainKeyFromCode('KeyZ')).toBe('Z');
    expect(mainKeyFromCode('Digit0')).toBe('0');
    expect(mainKeyFromCode('F1')).toBe('F1');
    expect(mainKeyFromCode('F24')).toBe('F24');
    expect(mainKeyFromCode('F25')).toBeNull();
    expect(mainKeyFromCode('Numpad9')).toBe('Numpad9');
    expect(mainKeyFromCode('NumpadEnter')).toBe('NumpadEnter');
    expect(mainKeyFromCode('IntlBackslash')).toBeNull();
  });
});

describe('formatKey', () => {
  it('shows a key the way people read it', () => {
    expect(formatKey('Ctrl+Alt+1')).toBe('Ctrl + Alt + 1');
    expect(formatKey('Numpad1')).toBe('Numpad 1');
    expect(formatKey('Ctrl+Minus')).toBe('Ctrl + -');
    expect(formatKey('Shift+PageDown')).toBe('Shift + Page Down');
  });

  it('says "Not set" when there is no key', () => {
    expect(formatKey(null)).toBe('Not set');
    expect(formatKey('')).toBe('Not set');
    expect(formatKey('nonsense')).toBe('Not set');
  });

  it('uses the names on this computer for Alt and the Windows or Command key', () => {
    expect(formatKey('Meta+Alt+K', 'mac')).toBe('Option + Cmd + K');
    expect(formatKey('Meta+K', 'windows')).toBe('Win + K');
    expect(formatKey('Meta+K', 'other')).toBe('Meta + K');
  });

  it('shows the modifiers she is holding while she picks the rest', () => {
    expect(formatHeld(['Ctrl', 'Alt'])).toBe('Ctrl + Alt + …');
    expect(formatHeld([])).toBe('…');
  });
});

describe('keyWarning', () => {
  const web = { global: false };
  const desktop = { global: true };

  it('warns about a plain key, Shift alone and the ordinary function keys', () => {
    for (const key of ['A', '5', 'Shift+A', 'F5', 'Space', 'Up']) {
      expect(keyWarning(key, web)).toMatch(/Ctrl \+ Alt/);
      expect(keyWarning(key, desktop)).toMatch(/Ctrl \+ Alt/);
    }
  });

  it('is happy with Ctrl, Alt or Meta, and with F13 to F24 and the number pad', () => {
    for (const key of ['Ctrl+1', 'Alt+A', 'Meta+Shift+K', 'Ctrl+Alt+Shift+9', 'F13', 'F24', 'Numpad7', 'Shift+Numpad7']) {
      expect(keyWarning(key, web)).toBeNull();
      expect(keyWarning(key, desktop)).toBeNull();
    }
  });

  it('explains the difference between the web and installed versions', () => {
    expect(keyWarning('A', web)).toMatch(/here/);
    expect(keyWarning('A', desktop)).toMatch(/games and other apps/);
  });

  it('has nothing to say about text that is not a key', () => {
    expect(keyWarning('nonsense', web)).toBeNull();
  });

  it('uses the names this device uses', () => {
    expect(keyWarning('A', { global: true, os: 'mac' })).toMatch(/Ctrl \+ Option \+ a number is a safer choice/);
    expect(keyWarning('A', { global: false, os: 'windows' })).toMatch(/Ctrl \+ Alt \+ a number is a safer choice/);
    expect(safeKeyAdvice()).toBe('Ctrl + Alt + a number');
    expect(safeKeyAdvice('ios')).toBe('Ctrl + Option + a number');
  });
});

describe('isBrowserKey', () => {
  it('spots keys a browser keeps for itself', () => {
    expect(isBrowserKey('Ctrl+W')).toBe(true);
    expect(isBrowserKey('ctrl+shift+t')).toBe(true);
    expect(isBrowserKey('Ctrl+3')).toBe(true);
    expect(isBrowserKey('Alt+F4')).toBe(true);
    expect(isBrowserKey('F5')).toBe(true);
  });

  it('lets everything else through', () => {
    expect(isBrowserKey('Ctrl+Alt+1')).toBe(false);
    expect(isBrowserKey('Ctrl+Shift+1')).toBe(false);
    expect(isBrowserKey('F13')).toBe(false);
    expect(isBrowserKey('nonsense')).toBe(false);
  });
});

describe('toGlobalShortcut', () => {
  it('writes a key the way the desktop shortcut plugin reads it', () => {
    expect(toGlobalShortcut('Ctrl+Shift+1')).toBe('Ctrl+Shift+1');
    expect(toGlobalShortcut('ctrl+meta+K')).toBe('Ctrl+Super+K');
    expect(toGlobalShortcut('Alt+Numpad4')).toBe('Alt+Numpad4');
    expect(toGlobalShortcut('F13')).toBe('F13');
    expect(toGlobalShortcut('nonsense')).toBeNull();
  });
});
