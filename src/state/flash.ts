import { useSyncExternalStore } from 'react';

/** How long a button stays brightened and pressed after a tap (StreamStudio uses the same). */
export const FLASH_MS = 350;

let flashing: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
const timers = new Map<string, number>();

function publish(next: ReadonlySet<string>) {
  flashing = next;
  for (const listener of listeners) listener();
}

/** Brightens a sound's button for a moment. A second tap starts the moment again. */
export function flashSound(soundId: string): void {
  window.clearTimeout(timers.get(soundId));
  timers.set(
    soundId,
    window.setTimeout(() => {
      timers.delete(soundId);
      const next = new Set(flashing);
      next.delete(soundId);
      publish(next);
    }, FLASH_MS),
  );
  if (!flashing.has(soundId)) publish(new Set(flashing).add(soundId));
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useFlashing(soundId: string): boolean {
  return useSyncExternalStore(subscribe, () => flashing.has(soundId));
}
