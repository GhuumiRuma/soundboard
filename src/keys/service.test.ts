import { describe, expect, it, vi } from 'vitest';
import type { BoardsData, SoundItem } from '../model/types';
import type { SoundKeyBinding, SoundKeyHost } from '../platform/types';
import { createSoundKeyService, type SoundKeySource, type SoundKeyState } from './service';

const sound = (id: string, name: string, hotkey: string | null): SoundItem => ({
  id,
  name,
  emoji: '🔊',
  color: '#7C3AED',
  mediaId: `media-${id}`,
  originalFileName: null,
  volume: 0.8,
  hotkey,
});

const data = (sounds: SoundItem[], stopAllKey: string | null = null): BoardsData => ({
  boards: [{ id: 'b1', name: 'My sounds', sounds }],
  masterVolume: 1,
  stopAllKey,
});

function fakeSource(initial: Partial<SoundKeyState> & { data: BoardsData }) {
  let state: SoundKeyState = { loaded: true, settings: { soundKeysEnabled: true }, ...initial };
  const listeners = new Set<() => void>();
  const source: SoundKeySource = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  return {
    source,
    change(next: Partial<SoundKeyState>) {
      state = { ...state, ...next };
      for (const listener of [...listeners]) listener();
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

/** A key host that remembers each call. `gate` lets a test hold a call open until it says so. */
function fakeHost(options: { global?: boolean; unavailable?: string[]; hold?: boolean; failWith?: Error } = {}) {
  const calls: string[][] = [];
  const bindings: SoundKeyBinding[][] = [];
  const pending: Array<() => void> = [];
  const host: SoundKeyHost = {
    global: options.global ?? false,
    async setKeys(next) {
      calls.push(next.map((b) => b.key));
      bindings.push([...next]);
      if (options.hold) await new Promise<void>((resolve) => pending.push(resolve));
      if (options.failWith) throw options.failWith;
      return { unavailable: options.unavailable ?? [] };
    },
  };
  return {
    host,
    calls,
    bindings,
    release: () => pending.splice(0).forEach((resolve) => resolve()),
    get waiting() {
      return pending.length;
    },
  };
}

const actions = () => ({ play: vi.fn(), stopAll: vi.fn() });
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('sound key service', () => {
  it('listens for each sound key and the Stop all key once her sounds have loaded', async () => {
    const world = fakeSource({ loaded: false, data: data([sound('a', 'Honk', 'ctrl+alt+1'), sound('b', 'Beep', null)], 'Ctrl+Alt+0') });
    const keys = fakeHost();
    const service = createSoundKeyService({ source: world.source, host: () => keys.host, actions: actions() });
    service.start();
    await settle();
    expect(keys.calls.at(-1)).toEqual([]);

    world.change({ loaded: true });
    await settle();
    expect(keys.calls.at(-1)).toEqual(['Ctrl+Alt+0', 'Ctrl+Alt+1']);
  });

  it('plays the sound for its key, and stops everything for the Stop all key', async () => {
    const world = fakeSource({ data: data([sound('a', 'Honk', 'Ctrl+Alt+1')], 'Ctrl+Alt+0') });
    const keys = fakeHost();
    const doing = actions();
    createSoundKeyService({ source: world.source, host: () => keys.host, actions: doing }).start();
    await settle();
    const [stop, honk] = keys.bindings.at(-1)!;
    honk.run();
    expect(doing.play).toHaveBeenCalledWith('a');
    expect(doing.stopAll).not.toHaveBeenCalled();
    stop.run();
    expect(doing.stopAll).toHaveBeenCalledTimes(1);
  });

  it('follows her changes: a new key, a removed key, and a rename that changes nothing', async () => {
    const world = fakeSource({ data: data([sound('a', 'Honk', 'Ctrl+Alt+1')]) });
    const keys = fakeHost();
    createSoundKeyService({ source: world.source, host: () => keys.host, actions: actions() }).start();
    await settle();
    expect(keys.calls).toEqual([['Ctrl+Alt+1']]);

    world.change({ data: data([sound('a', 'Honk', 'Ctrl+Alt+1'), sound('b', 'Beep', 'Ctrl+Alt+2')]) });
    await settle();
    expect(keys.calls.at(-1)).toEqual(['Ctrl+Alt+1', 'Ctrl+Alt+2']);

    const callsBefore = keys.calls.length;
    world.change({ data: data([sound('a', 'Honk renamed', 'Ctrl+Alt+1'), sound('b', 'Beep', 'Ctrl+Alt+2')]) });
    await settle();
    expect(keys.calls).toHaveLength(callsBefore);

    world.change({ data: data([sound('a', 'Honk', null), sound('b', 'Beep', 'Ctrl+Alt+2')]) });
    await settle();
    expect(keys.calls.at(-1)).toEqual(['Ctrl+Alt+2']);
  });

  it('listens again when two sounds swap keys', async () => {
    const world = fakeSource({ data: data([sound('a', 'Honk', 'Ctrl+Alt+1'), sound('b', 'Beep', 'Ctrl+Alt+2')]) });
    const keys = fakeHost();
    const doing = actions();
    createSoundKeyService({ source: world.source, host: () => keys.host, actions: doing }).start();
    await settle();
    world.change({ data: data([sound('a', 'Honk', 'Ctrl+Alt+2'), sound('b', 'Beep', 'Ctrl+Alt+1')]) });
    await settle();
    const swapped = keys.bindings.at(-1)!;
    swapped.find((b) => b.key === 'Ctrl+Alt+1')!.run();
    expect(doing.play).toHaveBeenCalledWith('b');
  });

  it('gives a shared key to the first owner only', async () => {
    const world = fakeSource({ data: data([sound('a', 'Honk', 'Ctrl+Alt+1'), sound('b', 'Beep', 'Ctrl+Alt+1')]) });
    const keys = fakeHost();
    const doing = actions();
    createSoundKeyService({ source: world.source, host: () => keys.host, actions: doing }).start();
    await settle();
    expect(keys.calls.at(-1)).toEqual(['Ctrl+Alt+1']);
    keys.bindings.at(-1)![0].run();
    expect(doing.play).toHaveBeenCalledWith('a');
  });

  it('listens for nothing while the Sound keys switch is off', async () => {
    const world = fakeSource({ data: data([sound('a', 'Honk', 'Ctrl+Alt+1')]) });
    const keys = fakeHost();
    createSoundKeyService({ source: world.source, host: () => keys.host, actions: actions() }).start();
    await settle();
    world.change({ settings: { soundKeysEnabled: false } });
    await settle();
    expect(keys.calls.at(-1)).toEqual([]);
    world.change({ settings: { soundKeysEnabled: true } });
    await settle();
    expect(keys.calls.at(-1)).toEqual(['Ctrl+Alt+1']);
  });

  it('never listens for Undo', async () => {
    const world = fakeSource({ data: data([sound('a', 'Honk', 'Ctrl+Z'), sound('b', 'Beep', 'Ctrl+Alt+2')]) });
    const keys = fakeHost({ global: true });
    createSoundKeyService({ source: world.source, host: () => keys.host, actions: actions() }).start();
    await settle();
    expect(keys.calls.at(-1)).toEqual(['Ctrl+Alt+2']);
  });

  it('goes quiet while the key recorder is open, then comes back', async () => {
    const world = fakeSource({ data: data([sound('a', 'Honk', 'Ctrl+Alt+1')]) });
    const keys = fakeHost();
    const service = createSoundKeyService({ source: world.source, host: () => keys.host, actions: actions() });
    service.start();
    await settle();
    const resume = service.suspend();
    const resumeToo = service.suspend();
    await settle();
    expect(keys.calls.at(-1)).toEqual([]);
    resume();
    resume();
    await settle();
    expect(keys.calls.at(-1)).toEqual([]);
    resumeToo();
    await settle();
    expect(keys.calls.at(-1)).toEqual(['Ctrl+Alt+1']);
  });

  it('talks to the platform one call at a time and ends with the latest wish', async () => {
    const world = fakeSource({ data: data([sound('a', 'Honk', 'Ctrl+Alt+1')]) });
    const keys = fakeHost({ hold: true });
    createSoundKeyService({ source: world.source, host: () => keys.host, actions: actions() }).start();
    await settle();
    expect(keys.calls).toHaveLength(1);

    world.change({ data: data([sound('a', 'Honk', 'Ctrl+Alt+2')]) });
    world.change({ data: data([sound('a', 'Honk', 'Ctrl+Alt+3')]) });
    await settle();
    expect(keys.calls).toHaveLength(1);
    expect(keys.waiting).toBe(1);

    keys.release();
    await settle();
    expect(keys.calls).toEqual([['Ctrl+Alt+1'], ['Ctrl+Alt+3']]);
    keys.release();
    await settle();
    expect(keys.calls).toHaveLength(2);
  });

  it('remembers which keys another program already has, and forgets them once they change', async () => {
    const world = fakeSource({ data: data([sound('a', 'Honk', 'Ctrl+Alt+1'), sound('b', 'Beep', 'Ctrl+Alt+2')]) });
    const keys = fakeHost({ unavailable: ['ctrl+alt+1'] });
    const service = createSoundKeyService({ source: world.source, host: () => keys.host, actions: actions() });
    const heard = vi.fn();
    service.subscribe(heard);
    service.start();
    await settle();
    expect(service.getStatus()).toEqual({ unavailable: ['Ctrl+Alt+1'], failed: false });
    expect(heard).toHaveBeenCalledTimes(1);

    world.change({ data: data([sound('a', 'Honk', 'Ctrl+Alt+5'), sound('b', 'Beep', 'Ctrl+Alt+2')]) });
    await settle();
    expect(service.getStatus().unavailable).toEqual(['Ctrl+Alt+1']);

    const noClash = fakeHost();
    const other = createSoundKeyService({ source: world.source, host: () => noClash.host, actions: actions() });
    other.start();
    await settle();
    expect(other.getStatus()).toEqual({ unavailable: [], failed: false });
  });

  it('keeps the "not working" list while the recorder is open, and clears it when keys are switched off', async () => {
    const world = fakeSource({ data: data([sound('a', 'Honk', 'Ctrl+Alt+1')]) });
    const keys = fakeHost({ unavailable: ['Ctrl+Alt+1'] });
    const service = createSoundKeyService({ source: world.source, host: () => keys.host, actions: actions() });
    service.start();
    await settle();
    const resume = service.suspend();
    await settle();
    expect(service.getStatus().unavailable).toEqual(['Ctrl+Alt+1']);
    resume();
    await settle();
    world.change({ settings: { soundKeysEnabled: false } });
    await settle();
    expect(service.getStatus()).toEqual({ unavailable: [], failed: false });
  });

  it('says so when the platform cannot do sound keys at all, and tries again on the next change', async () => {
    const world = fakeSource({ data: data([sound('a', 'Honk', 'Ctrl+Alt+1')]) });
    const keys = fakeHost({ failWith: new Error('no') });
    const service = createSoundKeyService({ source: world.source, host: () => keys.host, actions: actions() });
    service.start();
    await settle();
    expect(service.getStatus()).toEqual({ unavailable: [], failed: true });
    const before = keys.calls.length;
    world.change({ data: data([sound('a', 'Honk', 'Ctrl+Alt+1')]) });
    await settle();
    expect(keys.calls.length).toBe(before + 1);
  });

  it('lets go of its keys when it is stopped', async () => {
    const world = fakeSource({ data: data([sound('a', 'Honk', 'Ctrl+Alt+1')]) });
    const keys = fakeHost({ unavailable: ['Ctrl+Alt+1'] });
    const service = createSoundKeyService({ source: world.source, host: () => keys.host, actions: actions() });
    const stop = service.start();
    await settle();
    stop();
    await settle();
    expect(keys.calls.at(-1)).toEqual([]);
    expect(world.listenerCount).toBe(0);
    expect(service.getStatus()).toEqual({ unavailable: [], failed: false });
    world.change({ data: data([sound('a', 'Honk', 'Ctrl+Alt+7')]) });
    await settle();
    expect(keys.calls.at(-1)).toEqual([]);
  });
});
