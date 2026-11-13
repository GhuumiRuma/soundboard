import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeBuffer, FakeContext, deferred } from '../test/webaudio';
import type { AudioExt } from '../storage/import';
import {
  SoundEngine,
  SoundProblem,
  STOP_FADE_SECONDS,
  VOLUME_SMOOTHING_SECONDS,
  soundMessages,
  type EngineDeps,
  type MediaFile,
} from './engine';

const bytes = (size = 8) => new ArrayBuffer(size);
const sound = (id: string, mediaId = `media-${id}`, volume = 0.8) => ({ id, mediaId, volume });

type Options = Partial<EngineDeps> & { state?: string; decode?: FakeContext['decode'] };

function setup(options: Options = {}) {
  const { state = 'running', decode, ...deps } = options;
  const contexts: FakeContext[] = [];
  const files = new Map<string, MediaFile>();
  const reads: string[] = [];
  const engine = new SoundEngine({
    createContext: () => {
      const ctx = new FakeContext(state);
      if (decode) ctx.decode = decode;
      contexts.push(ctx);
      return ctx;
    },
    loadMedia: async (mediaId) => {
      reads.push(mediaId);
      const file = files.get(mediaId);
      return file && { data: file.data.slice(0), ext: file.ext };
    },
    canPlayOgg: () => true,
    yieldToBrowser: async () => {},
    ...deps,
  });
  return {
    engine,
    contexts,
    reads,
    /** Puts a sound file in the pretend storage, under the id `media-<name>` unless you give another. */
    add: (mediaId: string, ext: AudioExt = 'wav') => void files.set(mediaId, { data: bytes(), ext }),
    get ctx(): FakeContext {
      return contexts[contexts.length - 1];
    },
  };
}

/** Plays the sounds named, each with its own file already in storage. */
async function playAll(t: ReturnType<typeof setup>, ...names: string[]) {
  for (const name of names) {
    t.add(`media-${name}`);
    await t.engine.play(sound(name));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('playing a sound', () => {
  it('sends it through its own volume, then the master volume, then the speakers', async () => {
    const t = setup();
    t.add('m1');
    expect(await t.engine.play(sound('s1', 'm1', 0.5))).toEqual({ ok: true });

    const { ctx } = t;
    const [source] = ctx.sources;
    expect(source.started).toHaveLength(1);
    expect(source.connections[0]).toBe(ctx.voiceGains[0]);
    expect(ctx.voiceGains[0].connections[0]).toBe(ctx.master);
    expect(ctx.master.connections[0]).toBe(ctx.destination);
    expect(ctx.voiceGains[0].gain.value).toBe(0.5);
    expect(ctx.master.gain.value).toBe(1);
  });

  it('keeps a bad volume between silent and full', async () => {
    const t = setup();
    t.add('m1');
    await t.engine.play(sound('s1', 'm1', 7));
    await t.engine.play(sound('s1', 'm1', Number.NaN));
    expect(t.ctx.voiceGains.map((gain) => gain.gain.value)).toEqual([1, 0]);
  });

  it('lets taps on the same sound overlap', async () => {
    const t = setup();
    await playAll(t, 's1');
    await t.engine.play(sound('s1'));
    expect(t.ctx.sources).toHaveLength(2);
    expect(t.ctx.sources.every((source) => source.started.length === 1)).toBe(true);

    t.ctx.sources[0].end();
    expect(t.engine.getState().playing.has('s1')).toBe(true);
    t.ctx.sources[1].end();
    expect(t.engine.getState().playing.size).toBe(0);
  });

  it('plays different sounds together', async () => {
    const t = setup();
    await playAll(t, 'a', 'b', 'c');
    expect([...t.engine.getState().playing].sort()).toEqual(['a', 'b', 'c']);
  });

  it('tidies up a sound when it ends by itself', async () => {
    const t = setup();
    await playAll(t, 's1');
    const [source] = t.ctx.sources;
    source.end();
    expect(source.disconnectCount).toBe(1);
    expect(t.ctx.voiceGains[0].disconnectCount).toBe(1);
    expect(t.engine.getState().playing.size).toBe(0);
  });

  it('tells the screen when sounds start and end, and only then', async () => {
    const t = setup();
    t.add('media-s1');
    const listener = vi.fn();
    const stop = t.engine.subscribe(listener);
    const idle = t.engine.getState();

    await t.engine.play(sound('s1'));
    expect(listener).toHaveBeenCalled();
    const playing = t.engine.getState();
    expect(playing).not.toBe(idle);
    expect(playing.playing.has('s1')).toBe(true);

    // The same answer comes back until something changes (the screen relies on this).
    expect(t.engine.getState()).toBe(playing);

    listener.mockClear();
    t.engine.setMasterVolume(0.5);
    expect(listener).not.toHaveBeenCalled();

    t.ctx.sources[0].end();
    expect(listener).toHaveBeenCalledTimes(1);

    stop();
    listener.mockClear();
    await t.engine.play(sound('s1'));
    expect(listener).not.toHaveBeenCalled();
  });

  it('starts a sound that is ready in the very same moment as the tap', async () => {
    const t = setup();
    await playAll(t, 's1');
    void t.engine.play(sound('s1'));
    expect(t.ctx.sources).toHaveLength(2);
    expect(t.ctx.sources[1].started).toHaveLength(1);
  });

  it('wakes up paused sound straight away, inside the tap', async () => {
    const t = setup({ state: 'suspended' });
    t.add('media-s1');
    const result = t.engine.play(sound('s1'));
    expect(t.ctx.resumeCalls).toBe(1);
    await result;
    expect(t.ctx.sources).toHaveLength(1);
  });

  it('shows a sound as getting ready until its file has been read and decoded', async () => {
    const file = deferred<MediaFile | undefined>();
    const t = setup({ loadMedia: () => file.promise });
    const result = t.engine.play(sound('s1'));
    expect(t.engine.getState().loading.has('s1')).toBe(true);
    expect(t.engine.getState().playing.size).toBe(0);

    file.resolve({ data: bytes(), ext: 'wav' });
    expect(await result).toEqual({ ok: true });
    expect(t.engine.getState().loading.size).toBe(0);
    expect(t.engine.getState().playing.has('s1')).toBe(true);
  });
});

describe('Stop all', () => {
  it('silences everything at once, and fades each sound out in a blink so it does not click', async () => {
    const t = setup();
    await playAll(t, 'a', 'b');
    t.ctx.currentTime = 5;
    t.engine.stopAll();

    expect(t.engine.getState().playing.size).toBe(0);
    const fadeEnd = 5 + STOP_FADE_SECONDS;
    for (const source of t.ctx.sources) expect(source.stopped).toEqual([fadeEnd]);
    for (const gain of t.ctx.voiceGains) expect(gain.gain.events).toContainEqual({ type: 'ramp', value: 0, time: fadeEnd });

    t.ctx.sources.forEach((source) => source.end());
    expect(t.ctx.sources.every((source) => source.disconnectCount === 1)).toBe(true);
  });

  it('stops straight away when sound is paused, because a fade would never finish', async () => {
    const t = setup();
    await playAll(t, 'a');
    t.ctx.state = 'suspended';
    t.engine.stopAll();
    expect(t.ctx.sources[0].stopped).toEqual([undefined]);
    expect(t.ctx.sources[0].disconnectCount).toBe(1);
    expect(t.engine.getState().playing.size).toBe(0);
  });

  it('also cancels sounds that were still getting ready', async () => {
    const file = deferred<MediaFile | undefined>();
    const t = setup({ loadMedia: () => file.promise });
    const result = t.engine.play(sound('s1'));
    t.engine.stopAll();
    file.resolve({ data: bytes(), ext: 'wav' });

    expect(await result).toEqual({ ok: true });
    expect(t.ctx.sources).toHaveLength(0);
    expect(t.engine.getState().playing.size).toBe(0);
    expect(t.engine.getState().loading.size).toBe(0);

    // The next tap works normally, and the sound is ready by now.
    await t.engine.play(sound('s1'));
    expect(t.ctx.sources).toHaveLength(1);
  });

  it('does nothing when nothing is playing', () => {
    const t = setup();
    expect(() => t.engine.stopAll()).not.toThrow();
  });
});

describe('getting sounds ready', () => {
  it('decodes a sound once, however often it is tapped', async () => {
    const t = setup();
    await playAll(t, 's1');
    await t.engine.play(sound('s1'));
    await t.engine.play(sound('s1'));
    expect(t.ctx.decoded).toHaveLength(1);
    expect(t.reads).toEqual(['media-s1']);
  });

  it('decodes once even when several taps arrive before it is ready', async () => {
    const t = setup();
    t.add('media-s1');
    const results = await Promise.all([t.engine.play(sound('s1')), t.engine.play(sound('s1')), t.engine.play(sound('s1'))]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(t.ctx.decoded).toHaveLength(1);
    expect(t.reads).toEqual(['media-s1']);
    expect(t.ctx.sources).toHaveLength(3);
  });

  it('lets go of the sounds used longest ago when memory is full', async () => {
    // Each decoded sound here takes 4000 bytes, and there is room for two.
    const t = setup({ budgetBytes: 8000, decode: async () => new FakeBuffer(1000) });
    await playAll(t, 'a', 'b', 'c');
    expect(t.ctx.decoded).toHaveLength(3);

    await t.engine.play(sound('c'));
    expect(t.ctx.decoded).toHaveLength(3);
    await t.engine.play(sound('a'));
    expect(t.ctx.decoded).toHaveLength(4);
  });

  it('forgets a sound that is no longer used', async () => {
    const t = setup();
    await playAll(t, 's1');
    t.engine.forget('media-s1');
    await t.engine.play(sound('s1'));
    expect(t.ctx.decoded).toHaveLength(2);
  });

  it('keeps a sound that was just added, so its first tap is instant', async () => {
    const t = setup();
    const buffer = await t.engine.decode(bytes(), 'wav');
    t.engine.remember('media-new', buffer);
    void t.engine.play(sound('new', 'media-new'));
    expect(t.ctx.sources).toHaveLength(1);
    expect(t.reads).toEqual([]);
  });

  it('does not take the file away from whoever asked for the check', async () => {
    const t = setup();
    const data = bytes(16);
    await t.engine.decode(data, 'wav');
    expect(data.byteLength).toBe(16);
    expect(t.ctx.decoded[0]).not.toBe(data);
  });
});

describe('when a sound cannot be played', () => {
  it("says so when the sound's file is gone", async () => {
    const t = setup();
    expect(await t.engine.play(sound('s1', 'gone'))).toEqual({ ok: false, message: soundMessages.missing });
    expect(t.engine.getState().loading.size).toBe(0);
    expect(t.ctx.sources).toHaveLength(0);
  });

  it('says the file may be damaged when the browser cannot read it', async () => {
    const t = setup({
      decode: async () => {
        throw new Error('EncodingError');
      },
    });
    t.add('media-s1', 'mp3');
    expect(await t.engine.play(sound('s1'))).toEqual({ ok: false, message: soundMessages.damaged });
    expect(t.engine.getState().loading.size).toBe(0);
  });

  it('suggests MP3 or WAV when an OGG sound is too much for an older iPhone', async () => {
    const failing = async () => {
      throw new Error('EncodingError');
    };
    const old = setup({ decode: failing, canPlayOgg: () => false });
    old.add('media-s1', 'ogg');
    expect(await old.engine.play(sound('s1'))).toEqual({ ok: false, message: soundMessages.ogg });
    expect(soundMessages.ogg).toMatch(/MP3 or WAV/);

    // On a device that does play OGG, a failure means the file itself is damaged.
    const modern = setup({ decode: failing, canPlayOgg: () => true });
    modern.add('media-s1', 'ogg');
    expect(await modern.engine.play(sound('s1'))).toEqual({ ok: false, message: soundMessages.damaged });
  });

  it('throws a problem with a friendly message when a file fails the check before it is added', async () => {
    const t = setup({
      canPlayOgg: () => false,
      decode: async () => {
        throw new Error('EncodingError');
      },
    });
    const error = await t.engine.decode(bytes(), 'ogg').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SoundProblem);
    expect(error).toMatchObject({ kind: 'ogg', message: soundMessages.ogg });
    await expect(t.engine.decode(bytes(), 'mp3')).rejects.toMatchObject({ kind: 'damaged' });
  });

  it('says so when the browser has no sound at all', async () => {
    const none = setup({ createContext: () => null });
    expect(await none.engine.play(sound('s1'))).toEqual({ ok: false, message: soundMessages.unavailable });
    await expect(none.engine.decode(bytes(), 'wav')).rejects.toMatchObject({ kind: 'unavailable' });

    const broken = setup({
      createContext: () => {
        throw new Error('NotSupportedError');
      },
    });
    expect(await broken.engine.play(sound('s1'))).toEqual({ ok: false, message: soundMessages.unavailable });
  });

  it('only uses plain words in its messages', () => {
    for (const message of Object.values(soundMessages)) {
      expect(message).not.toMatch(/AudioContext|decode|buffer|codec|exception/i);
    }
  });
});

describe('volume', () => {
  it('uses the master volume that was set before sound started', async () => {
    const t = setup();
    t.engine.setMasterVolume(0.4);
    await playAll(t, 's1');
    expect(t.ctx.master.gain.value).toBe(0.4);
  });

  it('moves the master volume smoothly, and keeps it between silent and full', async () => {
    const t = setup();
    await playAll(t, 's1');
    t.ctx.currentTime = 2;
    t.engine.setMasterVolume(0.25);
    expect(t.ctx.master.gain.events).toEqual([
      { type: 'cancel', time: 2 },
      { type: 'target', value: 0.25, time: 2, timeConstant: VOLUME_SMOOTHING_SECONDS },
    ]);

    t.engine.setMasterVolume(7);
    expect(t.ctx.master.gain.latest).toBe(1);
    t.engine.setMasterVolume(-3);
    expect(t.ctx.master.gain.latest).toBe(0);
  });

  it("changes a sound's own volume while it is playing, and only that sound's", async () => {
    const t = setup();
    await playAll(t, 'a', 'b');
    t.engine.setSoundVolume('a', 0.2);
    expect(t.ctx.voiceGains[0].gain.latest).toBe(0.2);
    expect(t.ctx.voiceGains[1].gain.latest).toBe(0.8);
  });

  it('changes every copy of a sound that is playing more than once', async () => {
    const t = setup();
    await playAll(t, 'a');
    await t.engine.play(sound('a'));
    t.engine.setSoundVolume('a', 0.1);
    expect(t.ctx.voiceGains.map((gain) => gain.gain.latest)).toEqual([0.1, 0.1]);
  });
});

describe('many sounds at once', () => {
  it('cuts off the oldest sound when too many play together', async () => {
    const t = setup({ maxVoices: 2 });
    await playAll(t, 'a', 'b', 'c');
    expect([...t.engine.getState().playing].sort()).toEqual(['b', 'c']);
    expect(t.ctx.sources[0].stopped).toHaveLength(1);
    expect(t.ctx.sources[1].stopped).toHaveLength(0);
  });
});

describe('the sound system', () => {
  it('is only made when it is needed, and then reused', async () => {
    const t = setup();
    expect(t.contexts).toHaveLength(0);
    t.engine.recover();
    expect(t.contexts).toHaveLength(0);

    t.engine.unlock();
    expect(t.contexts).toHaveLength(1);
    expect(t.ctx.sources).toHaveLength(0);
    await playAll(t, 's1');
    expect(t.contexts).toHaveLength(1);
  });

  it('is woken up by a tap, and again after a phone call or switching apps', () => {
    const t = setup({ state: 'suspended' });
    expect(t.engine.isReady()).toBe(false);
    t.engine.unlock();
    expect(t.ctx.resumeCalls).toBe(1);
    expect(t.engine.isReady()).toBe(true);

    t.ctx.state = 'interrupted';
    expect(t.engine.isReady()).toBe(false);
    t.engine.recover();
    expect(t.ctx.resumeCalls).toBe(2);
    expect(t.engine.isReady()).toBe(true);

    t.engine.unlock();
    expect(t.ctx.resumeCalls).toBe(2);
  });

  it('does not wait for the browser to finish waking up before lining up the sound', async () => {
    const t = setup({ state: 'suspended' });
    t.add('media-s1');
    await t.engine.play(sound('s1'));
    expect(t.ctx.resumeCalls).toBe(1);
    expect(t.ctx.sources).toHaveLength(1);
  });

  it('makes a new one when the browser shuts the old one down', async () => {
    const t = setup();
    await playAll(t, 'a');
    t.contexts[0].state = 'closed';

    await playAll(t, 'b');
    expect(t.contexts).toHaveLength(2);
    expect(t.contexts[1].sources).toHaveLength(1);
    expect([...t.engine.getState().playing]).toEqual(['b']);
  });

  it("makes sound play even when an iPhone's silent switch is on", () => {
    vi.stubGlobal('navigator', { audioSession: { type: 'auto' } });
    const t = setup();
    t.engine.unlock();
    expect(navigator.audioSession?.type).toBe('playback');
  });

  it('carries on in browsers that have no audio session', () => {
    vi.stubGlobal('navigator', {});
    const t = setup();
    expect(() => t.engine.unlock()).not.toThrow();
  });

  it('can be closed', async () => {
    const t = setup();
    await playAll(t, 's1');
    await t.engine.close();
    expect(t.contexts[0].state).toBe('closed');
    expect(t.engine.getState().playing.size).toBe(0);
  });
});

describe('getting small sounds ready ahead of time', () => {
  const sizes = (entries: Record<string, number>) => async () => new Map(Object.entries(entries));

  it('does it once sound is allowed, for small sounds only', async () => {
    const t = setup({ mediaSizes: sizes({ small: 100, big: 5 * 1024 * 1024 }) });
    t.add('small');
    t.add('big');
    await t.engine.preload(['small', 'big']);
    expect(t.reads).toEqual([]);

    t.engine.unlock();
    await t.engine.preload(['small', 'big']);
    expect(t.reads).toEqual(['small']);

    // Its first tap is instant, and the big one still gets ready on its first tap.
    void t.engine.play(sound('s-small', 'small'));
    expect(t.ctx.sources).toHaveLength(1);
    await t.engine.play(sound('s-big', 'big'));
    expect(t.reads).toEqual(['small', 'big']);
  });

  it('also starts when the first thing she does is play a sound', async () => {
    const t = setup({ mediaSizes: sizes({ a: 100, b: 100 }) });
    t.add('a');
    t.add('b');
    await t.engine.preload(['a', 'b']);
    await t.engine.play(sound('first', 'a'));
    await t.engine.preload(['a', 'b']);
    expect(t.reads).toEqual(['a', 'b']);
  });

  it('stops once the ready sounds use half of the memory', async () => {
    // Each sound takes 4000 bytes and half the room is 8000, so two are enough.
    const t = setup({
      budgetBytes: 16000,
      decode: async () => new FakeBuffer(1000),
      mediaSizes: sizes({ a: 10, b: 10, c: 10, d: 10 }),
    });
    for (const id of ['a', 'b', 'c', 'd']) t.add(id);
    t.engine.unlock();
    await t.engine.preload(['a', 'b', 'c', 'd']);
    expect(t.reads).toEqual(['a', 'b']);
  });

  it('skips sounds that are already ready, and ones whose size it cannot tell', async () => {
    const t = setup({ mediaSizes: sizes({ a: 10, c: 10 }) });
    t.add('a');
    t.add('b');
    t.add('c');
    t.engine.unlock();
    t.engine.remember('a', new FakeBuffer(10));
    await t.engine.preload(['a', 'b', 'c']);
    expect(t.reads).toEqual(['c']);
  });

  it('carries on past a sound that will not decode, and past a failing size lookup', async () => {
    let calls = 0;
    const t = setup({
      mediaSizes: sizes({ a: 10, b: 10 }),
      decode: async () => {
        calls += 1;
        if (calls === 1) throw new Error('EncodingError');
        return new FakeBuffer(10);
      },
    });
    t.add('a');
    t.add('b');
    t.engine.unlock();
    await t.engine.preload(['a', 'b']);
    expect(t.reads).toEqual(['a', 'b']);
    expect(await t.engine.play(sound('sb', 'b'))).toEqual({ ok: true });

    const unreadable = setup({
      mediaSizes: async () => {
        throw new Error('The storage is busy');
      },
    });
    unreadable.engine.unlock();
    await expect(unreadable.engine.preload(['a'])).resolves.toBeUndefined();
  });
});
