import { describe, expect, it } from 'vitest';
import { backupFileName, safeFileStem, uniqueEntryName } from './format';

describe('backupFileName', () => {
  it('has her own date in it', () => {
    expect(backupFileName(new Date(2025, 4, 12, 23, 59))).toBe('Soundboard backup 2025-05-12.zip');
  });

  it('pads the month and the day', () => {
    expect(backupFileName(new Date(2026, 0, 3))).toBe('Soundboard backup 2026-01-03.zip');
  });
});

describe('safeFileStem', () => {
  it('keeps an ordinary name as it is', () => {
    expect(safeFileStem('Air horn')).toBe('Air horn');
    expect(safeFileStem('Café ☕ time')).toBe('Café ☕ time');
  });

  it('takes out the characters a file name can not have', () => {
    expect(safeFileStem('Who/what: "why"?')).toBe('Who what why');
    expect(safeFileStem('a\\b|c<d>e*f')).toBe('a b c d e f');
  });

  it('takes out control characters and extra spaces', () => {
    expect(safeFileStem('  two\n\tlines \u0000 here  ')).toBe('two lines here');
  });

  it('drops dots and spaces from the ends, which Windows does not allow', () => {
    expect(safeFileStem('...hello...')).toBe('hello');
    expect(safeFileStem('. . .')).toBe('Sound');
  });

  it('uses the fallback when nothing is left', () => {
    expect(safeFileStem('')).toBe('Sound');
    expect(safeFileStem('???')).toBe('Sound');
    expect(safeFileStem('???', 'Clip')).toBe('Clip');
  });

  it('cuts a long name, counting letters and not pieces of them', () => {
    const stem = safeFileStem('😀'.repeat(100), 'Sound', 10);
    expect(Array.from(stem)).toHaveLength(10);
    expect(stem).toBe('😀'.repeat(10));
  });

  it('does not leave a space at the end after cutting', () => {
    expect(safeFileStem('abcd efgh', 'Sound', 5)).toBe('abcd');
  });

  it('changes names Windows keeps for itself', () => {
    expect(safeFileStem('CON')).toBe('CON sound');
    expect(safeFileStem('nul')).toBe('nul sound');
    expect(safeFileStem('com1')).toBe('com1 sound');
    expect(safeFileStem('LPT9')).toBe('LPT9 sound');
    expect(safeFileStem('console')).toBe('console');
    expect(safeFileStem('COM10')).toBe('COM10');
  });
});

describe('uniqueEntryName', () => {
  it('puts the sound in the sounds folder', () => {
    expect(uniqueEntryName(new Set(), 'Air horn', 'wav')).toBe('sounds/Air horn.wav');
  });

  it('numbers a second sound with the same name', () => {
    const taken = new Set<string>();
    expect(uniqueEntryName(taken, 'Honk', 'mp3')).toBe('sounds/Honk.mp3');
    expect(uniqueEntryName(taken, 'Honk', 'mp3')).toBe('sounds/Honk (2).mp3');
    expect(uniqueEntryName(taken, 'Honk', 'mp3')).toBe('sounds/Honk (3).mp3');
  });

  it('treats capitals as the same, since Windows and Mac do', () => {
    const taken = new Set<string>();
    expect(uniqueEntryName(taken, 'honk', 'wav')).toBe('sounds/honk.wav');
    expect(uniqueEntryName(taken, 'HONK', 'wav')).toBe('sounds/HONK (2).wav');
  });

  it('does not clash across file types that differ only by ending', () => {
    const taken = new Set<string>();
    expect(uniqueEntryName(taken, 'Honk', 'mp3')).toBe('sounds/Honk.mp3');
    expect(uniqueEntryName(taken, 'Honk', 'wav')).toBe('sounds/Honk.wav');
  });

  it('cleans the name first', () => {
    expect(uniqueEntryName(new Set(), 'a/b', 'ogg')).toBe('sounds/a b.ogg');
  });
});
