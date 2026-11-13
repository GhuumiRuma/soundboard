import { describe, expect, it } from 'vitest';
import { bytesOf, fakeMp3Bytes, makeWav } from '../test/audio';
import { MAX_SOUND_BYTES, checkSoundBytes, importMessages, mimeForExt, readSoundFile, sniffMedia } from './import';

const sniff = (...bytes: number[]) => sniffMedia(new Uint8Array(bytes));

describe('sniffMedia', () => {
  it('knows MP3 by its tag or by its first frame', () => {
    expect(sniff(0x49, 0x44, 0x33, 3, 0)).toEqual({ kind: 'audio', ext: 'mp3', mime: 'audio/mpeg' });
    expect(sniff(0xff, 0xfb, 0x90, 0x00)).toMatchObject({ kind: 'audio', ext: 'mp3' });
    expect(sniff(0xff, 0xf3, 0x90, 0x00)).toMatchObject({ kind: 'audio', ext: 'mp3' });
  });

  it("doesn't mistake a half-matching frame for MP3", () => {
    expect(sniff(0xff, 0xe0, 0x90)).toBeNull();
    expect(sniff(0xff, 0xe8, 0x90)).toBeNull();
    expect(sniff(0xff, 0xfb, 0xf0)).toBeNull();
    expect(sniff(0xff, 0xfb, 0x9c)).toBeNull();
    expect(sniff(0xff, 0xfb)).toBeNull();
  });

  it('knows WAV and OGG', () => {
    expect(sniffMedia(new Uint8Array(makeWav(0.01)))).toEqual({ kind: 'audio', ext: 'wav', mime: 'audio/wav' });
    expect(sniff(0x4f, 0x67, 0x67, 0x53, 0)).toEqual({ kind: 'audio', ext: 'ogg', mime: 'audio/ogg' });
  });

  it('knows pictures and videos so it can say so', () => {
    expect(sniff(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)).toEqual({ kind: 'picture' });
    expect(sniffMedia(new TextEncoder().encode('GIF89a......'))).toEqual({ kind: 'picture' });
    expect(sniff(0xff, 0xd8, 0xff, 0xe0)).toEqual({ kind: 'picture' });
    expect(sniffMedia(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toEqual({ kind: 'picture' });
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, ...new TextEncoder().encode('B\u0082\u0084webm')]);
    expect(sniffMedia(webm)).toEqual({ kind: 'video' });
  });

  it("doesn't know anything else", () => {
    expect(sniff()).toBeNull();
    expect(sniff(1, 2, 3, 4)).toBeNull();
    expect(sniffMedia(new TextEncoder().encode('RIFF\0\0\0\0AVI LIST'))).toBeNull();
    expect(sniff(0x1a, 0x45, 0xdf, 0xa3, 0, 0)).toBeNull();
  });

  it('gives each kind of sound its own type', () => {
    expect(mimeForExt('mp3')).toBe('audio/mpeg');
    expect(mimeForExt('wav')).toBe('audio/wav');
    expect(mimeForExt('ogg')).toBe('audio/ogg');
  });
});

describe('importMessages', () => {
  it("says what StreamStudio says", () => {
    expect(importMessages.tooBig).toBe('That sound is too big (the limit is 20 MB).');
    expect(importMessages.unsupported).toBe("That file type isn't supported. Sounds can be MP3, WAV or OGG.");
    expect(importMessages.picture).toBe("That's a picture — soundboard buttons need a sound file (MP3, WAV or OGG).");
    expect(importMessages.video).toBe("That's a video — soundboard buttons need a sound file (MP3, WAV or OGG).");
  });
});

describe('checkSoundBytes', () => {
  it('accepts a sound and says what kind it is', () => {
    const wav = makeWav(0.1);
    const result = checkSoundBytes(wav);
    expect(result).toEqual({ ok: true, bytes: wav, ext: 'wav', mime: 'audio/wav' });
    expect(checkSoundBytes(fakeMp3Bytes())).toMatchObject({ ok: true, ext: 'mp3' });
  });

  it('accepts a sound of exactly 20 MB and refuses one byte more', () => {
    const exact = new Uint8Array(MAX_SOUND_BYTES);
    exact.set(new Uint8Array(makeWav(0.01)).subarray(0, 44));
    expect(checkSoundBytes(exact.buffer)).toMatchObject({ ok: true, ext: 'wav' });
    expect(checkSoundBytes(new ArrayBuffer(MAX_SOUND_BYTES + 1))).toEqual({ ok: false, message: importMessages.tooBig });
  });

  it('says so when a file is empty', () => {
    expect(checkSoundBytes(new ArrayBuffer(0))).toEqual({ ok: false, message: importMessages.empty });
  });

  it('says so when a file is not a sound', () => {
    expect(checkSoundBytes(bytesOf(1, 2, 3, 4, 5))).toEqual({ ok: false, message: importMessages.unsupported });
    expect(checkSoundBytes(bytesOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toEqual({ ok: false, message: importMessages.picture });
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...new TextEncoder().encode('webm')]);
    expect(checkSoundBytes(webm.buffer)).toEqual({ ok: false, message: importMessages.video });
  });
});

describe('readSoundFile', () => {
  it('reads a file and checks it', async () => {
    const result = await readSoundFile(new Blob([makeWav(0.05)], { type: 'audio/wav' }));
    expect(result).toMatchObject({ ok: true, ext: 'wav' });
  });

  it('refuses a big file without reading it', async () => {
    const huge = { size: MAX_SOUND_BYTES + 1, arrayBuffer: () => Promise.reject(new Error('should not be read')) } as unknown as Blob;
    expect(await readSoundFile(huge)).toEqual({ ok: false, message: importMessages.tooBig });
  });

  it('says so when a file is empty', async () => {
    expect(await readSoundFile(new Blob([]))).toEqual({ ok: false, message: importMessages.empty });
  });

  it("says so when a file can't be opened", async () => {
    const broken = { size: 10, arrayBuffer: () => Promise.reject(new Error('nope')) } as unknown as Blob;
    expect(await readSoundFile(broken)).toEqual({ ok: false, message: importMessages.unreadable });
  });
});
