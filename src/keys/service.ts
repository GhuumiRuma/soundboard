import type { BoardsData } from '../model/types';
import type { SoundKeyBinding, SoundKeyHost } from '../platform/types';
import { planKeys, type KeyOwner } from './clashes';
import { normalizeKeyString } from './keyString';

export interface SoundKeyState {
  loaded: boolean;
  data: BoardsData;
  settings: { soundKeysEnabled: boolean };
}

/** Where the service reads her boards and the on/off switch. The board store fits this. */
export interface SoundKeySource {
  getState(): SoundKeyState;
  subscribe(listener: () => void): () => void;
}

export interface SoundKeyActions {
  play(soundId: string): void;
  stopAll(): void;
}

export interface SoundKeyStatus {
  /** Saved keys (like "Ctrl+Alt+1") that could not be taken, most likely because another program uses them. */
  unavailable: readonly string[];
  /** True when the app could not turn sound keys on at all. */
  failed: boolean;
}

export interface SoundKeyService {
  /** Starts keeping the platform's keys in step with her boards. Returns a function that stops. */
  start(): () => void;
  /** Turns every sound key off until the returned function is called (the key recorder does this while she picks a key). */
  suspend(): () => void;
  getStatus(): SoundKeyStatus;
  subscribe(listener: () => void): () => void;
}

const FINE: SoundKeyStatus = { unavailable: [], failed: false };

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value, i) => value === b[i]);

/**
 * Makes the keys the app is listening for match what she has set: each sound's key, the Stop all key, and nothing at all
 * when sound keys are switched off, her sounds haven't loaded yet, or the key recorder has asked for quiet.
 * It talks to the platform one call at a time, and when things change meanwhile the last wish wins.
 */
export function createSoundKeyService(deps: { source: SoundKeySource; host: () => SoundKeyHost; actions: SoundKeyActions }): SoundKeyService {
  const listeners = new Set<() => void>();
  let status = FINE;
  let suspended = 0;
  let started = false;
  let unwatch: (() => void) | null = null;
  let busy = false;
  let again = false;
  /** What the platform was last given, so nothing is sent twice. */
  let applied: string | null = null;

  const setStatus = (next: SoundKeyStatus) => {
    if (next.failed === status.failed && sameList(next.unavailable, status.unavailable)) return;
    status = next;
    for (const listener of [...listeners]) listener();
  };

  const wish = (host: SoundKeyHost) => {
    const state = deps.source.getState();
    const enabled = state.loaded && state.settings.soundKeysEnabled;
    const owners: KeyOwner[] = enabled && suspended === 0 ? planKeys(state.data, { global: host.global }).active : [];
    return { enabled, quiet: suspended > 0, owners };
  };

  const sync = async () => {
    if (!started) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      do {
        again = false;
        const host = deps.host();
        const { enabled, quiet, owners } = wish(host);
        const signature = owners.map((o) => `${o.kind}:${o.id}@${o.key}`).join('|');
        if (signature === applied) continue;
        applied = signature;
        const bindings: SoundKeyBinding[] = owners.map((o) => ({
          key: o.key,
          run: o.kind === 'stop' ? () => deps.actions.stopAll() : () => deps.actions.play(o.id),
        }));
        try {
          const result = await host.setKeys(bindings);
          // While the recorder has things quiet there is nothing to report, so what she saw before stays.
          if (!quiet) {
            const unavailable = enabled ? result.unavailable.map((key) => normalizeKeyString(key) ?? key) : [];
            setStatus({ unavailable, failed: false });
          }
        } catch {
          applied = null;
          if (!quiet) setStatus({ unavailable: [], failed: enabled });
        }
      } while (again);
    } finally {
      busy = false;
    }
  };

  const stop = () => {
    if (!started) return;
    started = false;
    unwatch?.();
    unwatch = null;
    applied = null;
    setStatus(FINE);
    void deps.host().setKeys([]).catch(() => undefined);
  };

  return {
    start() {
      if (!started) {
        started = true;
        unwatch = deps.source.subscribe(() => void sync());
        void sync();
      }
      return stop;
    },
    suspend() {
      suspended += 1;
      void sync();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        suspended -= 1;
        void sync();
      };
    },
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
