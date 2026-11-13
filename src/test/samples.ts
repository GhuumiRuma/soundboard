/** Made-up recordings for tests: lists of samples (numbers from -1 to 1), so no microphone is needed. */

export const RATE = 48000;

/** `seconds` of a steady 440 Hz tone whose loudest samples are `level`. */
export const tone = (seconds: number, level: number, rate = RATE): Float32Array => {
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++) out[i] = level * Math.sin((2 * Math.PI * 440 * i) / rate);
  return out;
};

/** `seconds` of nothing at all. */
export const silence = (seconds: number, rate = RATE): Float32Array => new Float32Array(Math.round(seconds * rate));

/** `seconds` of the same value over and over. */
export const flat = (seconds: number, value: number, rate = RATE): Float32Array =>
  new Float32Array(Math.round(seconds * rate)).fill(value);

/** The parts one after another. */
export const join = (...parts: Float32Array[]): Float32Array => {
  const out = new Float32Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
