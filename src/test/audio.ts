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
