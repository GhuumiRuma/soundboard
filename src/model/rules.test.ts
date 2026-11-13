import { describe, expect, it } from 'vitest';
import {
  EMOJIS,
  MAX_NAME_LENGTH,
  PALETTE,
  clamp01,
  plainName,
  sanitizeColor,
  sanitizeEmoji,
  sanitizeMasterVolume,
  sanitizeVolume,
  soundNameFromFile,
} from './rules';

describe('plainName', () => {
  it('uses the fallback when there is no name', () => {
    expect(plainName(undefined, 'Sound')).toBe('Sound');
    expect(plainName(null, 'Sound')).toBe('Sound');
    expect(plainName('', 'Sound')).toBe('Sound');
    expect(plainName('   \t\n ', 'Sound')).toBe('Sound');
    expect(plainName(42, 'Sound')).toBe('Sound');
  });

  it('uses the fallback when only control characters are left', () => {
    expect(plainName('\u0001\u0002', 'Sound')).toBe('Sound');
    expect(plainName(' \u0007 ', 'Sound')).toBe('Sound');
  });

  it('puts the name on one line and strips control characters', () => {
    expect(plainName('  Air   horn  ', 'Sound')).toBe('Air horn');
    expect(plainName('Air\nhorn\r\n!', 'Sound')).toBe('Air horn !');
    expect(plainName('Air\u0000horn', 'Sound')).toBe('Air horn');
    expect(plainName('Air\u00a0horn\u2003loud', 'Sound')).toBe('Air horn loud');
  });

  it('keeps a name that is exactly as long as allowed', () => {
    const name = 'a'.repeat(MAX_NAME_LENGTH);
    expect(plainName(name, 'Sound')).toBe(name);
  });

  it('cuts a longer name and ends it with an ellipsis', () => {
    const cut = plainName('a'.repeat(MAX_NAME_LENGTH + 1), 'Sound');
    expect(cut).toBe('a'.repeat(MAX_NAME_LENGTH - 1) + '…');
    expect(cut.length).toBe(MAX_NAME_LENGTH);
    expect(plainName('b'.repeat(5000), 'Sound').length).toBe(MAX_NAME_LENGTH);
  });

  it('does not leave a space in front of the ellipsis', () => {
    const name = 'a'.repeat(MAX_NAME_LENGTH - 2) + ' ' + 'b'.repeat(10);
    expect(plainName(name, 'Sound')).toBe('a'.repeat(MAX_NAME_LENGTH - 2) + '…');
  });

  it('never splits an emoji or a letter with an accent', () => {
    const family = '👨‍👩‍👧‍👦';
    const name = 'a'.repeat(MAX_NAME_LENGTH - 3) + family + 'tail';
    const cut = plainName(name, 'Sound');
    expect(cut.endsWith('…')).toBe(true);
    expect(cut).not.toContain('\u200d…');
    expect(cut.slice(0, -1)).toBe('a'.repeat(MAX_NAME_LENGTH - 3));

    const accent = 'e\u0301';
    const accented = 'a'.repeat(MAX_NAME_LENGTH - 2) + accent + 'zz';
    const result = plainName(accented, 'Sound');
    expect(result.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    expect(result.slice(0, -1)).not.toMatch(/e$/);
  });

  it('keeps short emoji names whole', () => {
    expect(plainName('🔥 Fire 🔥', 'Sound')).toBe('🔥 Fire 🔥');
  });
});

describe('sanitizeEmoji', () => {
  it('uses the speaker when there is no emoji', () => {
    for (const value of [undefined, null, '', '   ', 7]) expect(sanitizeEmoji(value)).toBe('🔊');
  });

  it('uses the speaker when the text holds a control character', () => {
    expect(sanitizeEmoji('🎉\n')).toBe('🎉');
    expect(sanitizeEmoji('a\u0001b')).toBe('🔊');
  });

  it('keeps one or two characters as she sees them', () => {
    expect(sanitizeEmoji('🎉')).toBe('🎉');
    expect(sanitizeEmoji('🎉🔥')).toBe('🎉🔥');
    expect(sanitizeEmoji(' 🎉 ')).toBe('🎉');
    expect(sanitizeEmoji('👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦');
    expect(sanitizeEmoji('🇬🇧🔥')).toBe('🇬🇧🔥');
    expect(sanitizeEmoji('👍🏽')).toBe('👍🏽');
  });

  it('keeps only the first two when there are more', () => {
    expect(sanitizeEmoji('🎉🔥✨')).toBe('🎉🔥');
    expect(sanitizeEmoji('abc')).toBe('ab');
  });
});

describe('sanitizeColor', () => {
  it('accepts #RRGGBB and writes it in capitals', () => {
    expect(sanitizeColor('#7c3aed')).toBe('#7C3AED');
    expect(sanitizeColor('  #db2777 ')).toBe('#DB2777');
    expect(sanitizeColor('#0891B2')).toBe('#0891B2');
  });

  it('falls back to purple for anything else', () => {
    for (const value of [undefined, null, '', 'red', '#FFF', '#12345', '#1234567', '#GGGGGG', '7C3AED', '#12 456', 12]) {
      expect(sanitizeColor(value)).toBe('#7C3AED');
    }
  });

  it('knows every colour in the palette', () => {
    for (const color of PALETTE) expect(sanitizeColor(color)).toBe(color);
  });
});

describe('volumes', () => {
  it('keeps a volume between 0 and 1', () => {
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(7)).toBe(1);
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(Number.NaN, 0.5)).toBe(0.5);
    expect(clamp01(Infinity, 0.5)).toBe(0.5);
    expect(clamp01('0.5', 0.25)).toBe(0.25);
  });

  it('starts a sound at 80% and the master volume at full', () => {
    expect(sanitizeVolume(undefined)).toBe(0.8);
    expect(sanitizeVolume(1.5)).toBe(1);
    expect(sanitizeMasterVolume(undefined)).toBe(1);
    expect(sanitizeMasterVolume(0)).toBe(0);
  });
});

describe('palette and emoji', () => {
  it('has the 8 colours and 24 emoji from StreamStudio', () => {
    expect(PALETTE).toHaveLength(8);
    expect(EMOJIS).toHaveLength(24);
    expect(new Set(EMOJIS).size).toBe(24);
    for (const emoji of EMOJIS) expect(sanitizeEmoji(emoji)).toBe(emoji);
  });
});

describe('soundNameFromFile', () => {
  it('turns a file name into a friendly name', () => {
    expect(soundNameFromFile('air_horn-2.mp3')).toBe('Air horn 2');
    expect(soundNameFromFile('boom.WAV')).toBe('Boom');
    expect(soundNameFromFile('C:\\Users\\me\\Sounds\\clap.ogg')).toBe('Clap');
    expect(soundNameFromFile('/home/me/sounds/rimshot.mp3')).toBe('Rimshot');
    expect(soundNameFromFile('a.b.c.mp3')).toBe('A.b.c');
    expect(soundNameFromFile('noextension')).toBe('Noextension');
  });

  it('has a name for a file with no usable name', () => {
    expect(soundNameFromFile('.mp3')).toBe('New sound');
    expect(soundNameFromFile('')).toBe('New sound');
    expect(soundNameFromFile('___.wav')).toBe('New sound');
  });

  it('cuts a very long file name', () => {
    expect(soundNameFromFile('x'.repeat(300) + '.mp3').length).toBe(MAX_NAME_LENGTH);
  });
});
