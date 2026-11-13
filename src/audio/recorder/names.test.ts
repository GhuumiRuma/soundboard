import { describe, expect, it } from 'vitest';
import { DEFAULT_RECORDING_NAME, MAX_FILE_NAME_LENGTH, recordingFileBase, recordingFileName } from './names';

describe('the file name of a recording', () => {
  it('keeps a plain name as it is', () => {
    expect(recordingFileBase('Door slam')).toBe('Door slam');
    expect(recordingFileBase('Café ☕ 2')).toBe('Café ☕ 2');
  });

  it('is "My recording" when nothing usable is left', () => {
    expect(DEFAULT_RECORDING_NAME).toBe('My recording');
    expect(recordingFileBase('')).toBe('My recording');
    expect(recordingFileBase('   ')).toBe('My recording');
    expect(recordingFileBase('???')).toBe('My recording');
    expect(recordingFileBase('...')).toBe('My recording');
    expect(recordingFileBase(null)).toBe('My recording');
    expect(recordingFileBase(undefined)).toBe('My recording');
  });

  it("turns what a file name can't hold into a space", () => {
    expect(recordingFileBase('a/b\\c:d')).toBe('a b c d');
    expect(recordingFileBase('what?*"<>|')).toBe('what');
    expect(recordingFileBase('a\u0000b\u001fc')).toBe('a b c');
    expect(recordingFileBase('tab\there')).toBe('tab here');
  });

  it('squeezes runs of spaces into one and trims both ends', () => {
    expect(recordingFileBase('  a   b \n c  ')).toBe('a b c');
    expect(recordingFileBase('a / / b')).toBe('a b');
  });

  it('drops dots and spaces at the end', () => {
    expect(recordingFileBase('Hello...')).toBe('Hello');
    expect(recordingFileBase('Hi . .')).toBe('Hi');
    expect(recordingFileBase('v1.2')).toBe('v1.2');
  });

  it('puts "My " in front of the names Windows keeps for itself', () => {
    expect(recordingFileBase('CON')).toBe('My CON');
    expect(recordingFileBase('con')).toBe('My con');
    expect(recordingFileBase('Nul ')).toBe('My Nul');
    expect(recordingFileBase('aux.txt')).toBe('My aux.txt');
    expect(recordingFileBase('COM1')).toBe('My COM1');
    expect(recordingFileBase('lpt9.')).toBe('My lpt9');
    expect(recordingFileBase('COM\u00B2')).toBe('My COM\u00B2');
    expect(recordingFileBase('CON ...')).toBe('My CON');
  });

  it('leaves names that only start like those alone', () => {
    expect(recordingFileBase('Console')).toBe('Console');
    expect(recordingFileBase('COM10')).toBe('COM10');
    expect(recordingFileBase('con tact')).toBe('con tact');
  });

  it('is never longer than 60 characters', () => {
    expect(MAX_FILE_NAME_LENGTH).toBe(60);
    expect(recordingFileBase('a'.repeat(70))).toBe('a'.repeat(60));
    expect(recordingFileBase('a'.repeat(60))).toBe('a'.repeat(60));
  });

  it('never cuts an emoji in half', () => {
    const name = `${'a'.repeat(59)}😀`;
    expect(name.length).toBe(61);
    expect(recordingFileBase(name)).toBe('a'.repeat(59));
    expect(recordingFileBase(`${'a'.repeat(58)}😀`)).toBe(`${'a'.repeat(58)}😀`);
  });

  it("doesn't leave a space at the end after cutting", () => {
    expect(recordingFileBase(`${'a'.repeat(59)} bbbb`)).toBe('a'.repeat(59));
  });

  it('makes a .wav file name', () => {
    expect(recordingFileName('Door slam')).toBe('Door slam.wav');
    expect(recordingFileName('')).toBe('My recording.wav');
  });
});
