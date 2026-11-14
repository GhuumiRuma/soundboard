import { downmixToMono } from './rules';

/** The rate every file is opened at, whatever it was made with. CD quality is plenty for a sound button. */
export const CLIP_RATE = 44100;

/** One channel of sound, as numbers from -1 to 1. */
export interface DecodedSound {
  samples: Float32Array;
  rate: number;
}

type OfflineContextConstructor = new (channels: number, length: number, rate: number) => OfflineAudioContext;

const offlineContextConstructor = (): OfflineContextConstructor | null => {
  const scope = globalThis as unknown as {
    OfflineAudioContext?: OfflineContextConstructor;
    webkitOfflineAudioContext?: OfflineContextConstructor;
  };
  return scope.OfflineAudioContext ?? scope.webkitOfflineAudioContext ?? null;
};

/**
 * Opens a sound or video file with the browser's own decoder and gives back one channel of its sound. That is whatever
 * the browser can play: MP3, WAV, M4A and the sound of an MP4, MOV or WebM video. Throws when it can't be opened.
 */
export const decodeFile = async (bytes: ArrayBuffer): Promise<DecodedSound> => {
  const Context = offlineContextConstructor();
  if (!Context) throw new Error('This browser has no way to open sound files.');
  const context = new Context(1, 1, CLIP_RATE);

  const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
    // Older Safari only calls the two functions. Everything newer calls them and also gives back a promise.
    const result: Promise<AudioBuffer> | undefined = context.decodeAudioData(bytes, resolve, reject);
    result?.then(resolve, reject);
  });

  const channels: Float32Array[] = [];
  for (let at = 0; at < buffer.numberOfChannels; at++) channels.push(buffer.getChannelData(at));
  return { samples: downmixToMono(channels), rate: buffer.sampleRate };
};

/**
 * How long a file is, in milliseconds, by asking the browser's player (it only reads the start of the file). Null when
 * the browser can't say or doesn't within `timeoutMs`: some files don't carry their length.
 */
export const probeDuration = (file: Blob, timeoutMs = 6000): Promise<number | null> =>
  new Promise((resolve) => {
    let url: string;
    try {
      url = URL.createObjectURL(file);
    } catch {
      resolve(null);
      return;
    }
    // A video element opens a sound file just as well, and it is the one that opens both.
    const element = document.createElement('video');
    let finished = false;
    const finish = (ms: number | null): void => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      element.onloadedmetadata = null;
      element.onerror = null;
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
      resolve(ms);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);

    element.preload = 'metadata';
    element.muted = true;
    element.playsInline = true;
    element.onloadedmetadata = () => {
      const seconds = element.duration;
      finish(Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null);
    };
    element.onerror = () => finish(null);
    element.src = url;
  });
