/** Makes a short beep as a mono 16-bit WAV file. The tests use this so no real sounds are needed. */
export function makeWav(seconds = 0.25, frequency = 440, sampleRate = 44100, amplitude = 0.5): ArrayBuffer {
  const frames = Math.max(1, Math.round(seconds * sampleRate));
  const buffer = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + frames * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) {
    const sample = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * amplitude;
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }
  return buffer;
}

/** The first bytes of an MP3 file that starts with a tag. It can't be played, but it looks like an MP3. */
export function fakeMp3Bytes(length = 64): ArrayBuffer {
  const bytes = new Uint8Array(length);
  bytes.set([0x49, 0x44, 0x33, 0x03, 0x00]);
  return bytes.buffer;
}

export function bytesOf(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

const letters = (text: string): number[] => Array.from(text, (c) => c.charCodeAt(0));
const be32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

/** A box of an MP4 file: its size, its four-letter name, then what is inside it. */
export function mp4Box(type: string, ...parts: ArrayLike<number>[]): number[] {
  const body = parts.flatMap((part) => Array.from(part));
  return [...be32(8 + body.length), ...letters(type), ...body];
}

/**
 * The bytes of an MP4 file with the given brand and tracks ("soun" holds sound, "vide" holds a picture). It can't be
 * played, but it is laid out like one. `moovLast` puts the index after the sound, like phone recorders do.
 */
export function fakeMp4Bytes(brand: string, tracks: readonly string[], options: { moovLast?: boolean; mdatBytes?: number } = {}): ArrayBuffer {
  const ftyp = mp4Box('ftyp', letters(brand), be32(0), letters(brand));
  const trak = (kind: string) =>
    mp4Box('trak', mp4Box('tkhd', new Array(84).fill(0)), mp4Box('mdia', mp4Box('mdhd', new Array(24).fill(0)), mp4Box('hdlr', be32(0), be32(0), letters(kind), new Array(13).fill(0))));
  const moov = mp4Box('moov', mp4Box('mvhd', new Array(100).fill(0)), ...tracks.map(trak));
  const mdat = mp4Box('mdat', new Array(options.mdatBytes ?? 32).fill(7));
  const order = options.moovLast ? [ftyp, mdat, moov] : [ftyp, moov, mdat];
  return Uint8Array.from(order.flat()).buffer;
}
