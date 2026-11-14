import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIP_RATE, decodeFile, probeDuration } from './decode';

/** A decoded sound as the browser hands it over: some channels and a rate. */
class FakeDecoded {
  constructor(
    readonly channels: Float32Array[],
    readonly sampleRate = CLIP_RATE,
  ) {}

  get numberOfChannels(): number {
    return this.channels.length;
  }

  getChannelData(at: number): Float32Array {
    return this.channels[at];
  }
}

type Style = 'both' | 'promise' | 'callbacks';

/** Stands in for the browser's OfflineAudioContext, which is what decodes a file. */
class FakeOffline {
  static made: FakeOffline[] = [];
  /** How it answers: like current browsers (a promise and the callbacks), or like old Safari (callbacks only). */
  static style: Style = 'both';
  static outcome: { sound: FakeDecoded } | { error: Error } = { sound: new FakeDecoded([Float32Array.of(0.5)]) };

  constructor(
    readonly channels: number,
    readonly length: number,
    readonly rate: number,
  ) {
    FakeOffline.made.push(this);
  }

  decodeAudioData(
    _bytes: ArrayBuffer,
    ok?: (sound: FakeDecoded) => void,
    fail?: (error: Error) => void,
  ): Promise<FakeDecoded> | undefined {
    const outcome = FakeOffline.outcome;
    const style = FakeOffline.style;
    if (style !== 'promise') {
      if ('sound' in outcome) ok?.(outcome.sound);
      else fail?.(outcome.error);
    }
    if (style === 'callbacks') return undefined;
    return 'sound' in outcome ? Promise.resolve(outcome.sound) : Promise.reject(outcome.error);
  }
}

describe('opening a file to clip', () => {
  beforeEach(() => {
    FakeOffline.made = [];
    FakeOffline.style = 'both';
    FakeOffline.outcome = { sound: new FakeDecoded([Float32Array.of(0.5)]) };
    vi.stubGlobal('OfflineAudioContext', FakeOffline);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gives back one channel of sound and its rate', async () => {
    FakeOffline.outcome = { sound: new FakeDecoded([Float32Array.of(1, 0, 0.5), Float32Array.of(0, 1, 0.5)], 44100) };
    const sound = await decodeFile(new ArrayBuffer(8));
    expect(Array.from(sound.samples)).toEqual([0.5, 0.5, 0.5]);
    expect(sound.rate).toBe(44100);
  });

  it('opens it at CD quality, whatever it was made with', async () => {
    await decodeFile(new ArrayBuffer(8));
    expect(FakeOffline.made).toHaveLength(1);
    expect(FakeOffline.made[0].rate).toBe(44100);
    expect(FakeOffline.made[0].channels).toBe(1);
  });

  it('works with a browser that only calls back (older Safari)', async () => {
    FakeOffline.style = 'callbacks';
    FakeOffline.outcome = { sound: new FakeDecoded([Float32Array.of(0.25, 0.75)]) };
    const sound = await decodeFile(new ArrayBuffer(8));
    expect(Array.from(sound.samples)).toEqual([0.25, 0.75]);
  });

  it('works with a browser that only gives a promise', async () => {
    FakeOffline.style = 'promise';
    FakeOffline.outcome = { sound: new FakeDecoded([Float32Array.of(0.25, 0.75)]) };
    const sound = await decodeFile(new ArrayBuffer(8));
    expect(Array.from(sound.samples)).toEqual([0.25, 0.75]);
  });

  it('fails when the file has no sound the browser can open', async () => {
    FakeOffline.outcome = { error: new Error('EncodingError') };
    await expect(decodeFile(new ArrayBuffer(8))).rejects.toThrow('EncodingError');
  });

  it('fails when an older browser calls back with the problem', async () => {
    FakeOffline.style = 'callbacks';
    FakeOffline.outcome = { error: new Error('EncodingError') };
    await expect(decodeFile(new ArrayBuffer(8))).rejects.toThrow('EncodingError');
  });

  it("falls back to Safari's own name for the decoder", async () => {
    vi.stubGlobal('OfflineAudioContext', undefined);
    vi.stubGlobal('webkitOfflineAudioContext', FakeOffline);
    const sound = await decodeFile(new ArrayBuffer(8));
    expect(sound.samples).toHaveLength(1);
  });

  it('fails plainly when the browser has no decoder at all', async () => {
    vi.stubGlobal('OfflineAudioContext', undefined);
    await expect(decodeFile(new ArrayBuffer(8))).rejects.toThrow(/no way to open sound files/);
  });
});

/** A video element, as far as measuring a file's length goes. */
class FakeVideo {
  static made: FakeVideo[] = [];
  preload = '';
  muted = false;
  playsInline = false;
  duration = Number.NaN;
  src = '';
  onloadedmetadata: (() => void) | null = null;
  onerror: (() => void) | null = null;
  attributesRemoved: string[] = [];
  loads = 0;

  constructor() {
    FakeVideo.made.push(this);
  }

  removeAttribute(name: string): void {
    this.attributesRemoved.push(name);
  }

  load(): void {
    this.loads += 1;
  }
}

describe('asking how long a file is', () => {
  let revoked: string[];

  beforeEach(() => {
    FakeVideo.made = [];
    revoked = [];
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('document', { createElement: () => new FakeVideo() });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:file');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
      revoked.push(url);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const file = new Blob(['x']);

  it('gives the length in whole milliseconds once the browser has read the start of the file', async () => {
    const answer = probeDuration(file);
    const [video] = FakeVideo.made;
    expect(video.src).toBe('blob:file');
    expect(video.preload).toBe('metadata');
    video.duration = 12.3456;
    video.onloadedmetadata?.();
    await expect(answer).resolves.toBe(12346);
  });

  it('lets go of the file once it has an answer', async () => {
    const answer = probeDuration(file);
    const [video] = FakeVideo.made;
    video.duration = 3;
    video.onloadedmetadata?.();
    video.onloadedmetadata?.();
    video.onerror?.();
    await answer;
    expect(revoked).toEqual(['blob:file']);
    expect(video.attributesRemoved).toEqual(['src']);
    expect(video.loads).toBe(1);
  });

  it("is null when the file doesn't say how long it is", async () => {
    const answer = probeDuration(file);
    const [video] = FakeVideo.made;
    video.duration = Number.POSITIVE_INFINITY;
    video.onloadedmetadata?.();
    await expect(answer).resolves.toBeNull();
  });

  it("is null when the browser can't play the file", async () => {
    const answer = probeDuration(file);
    FakeVideo.made[0].onerror?.();
    await expect(answer).resolves.toBeNull();
    expect(revoked).toEqual(['blob:file']);
  });

  it("is null when the browser doesn't say in time", async () => {
    const answer = probeDuration(file, 1000);
    vi.advanceTimersByTime(999);
    expect(revoked).toEqual([]);
    vi.advanceTimersByTime(1);
    await expect(answer).resolves.toBeNull();
    expect(revoked).toEqual(['blob:file']);
  });

  it('is null when the browser cannot even point at the file', async () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('nope');
    });
    await expect(probeDuration(file)).resolves.toBeNull();
    expect(FakeVideo.made).toHaveLength(0);
  });
});
