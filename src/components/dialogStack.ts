import { useSyncExternalStore } from 'react';

/**
 * The pop-up boxes that are open right now, oldest first. A browser dialog covers everything behind it, including the
 * messages at the bottom of the screen, so those need to know which box is on top to show up inside it.
 */
let open: HTMLDialogElement[] = [];
let top: HTMLDialogElement | null = null;
const listeners = new Set<() => void>();

const refresh = () => {
  const next = open.length > 0 ? open[open.length - 1] : null;
  if (next === top) return;
  top = next;
  listeners.forEach((listener) => listener());
};

/** Call when a box opens. Returns the function to call when it closes. */
export function registerOpenDialog(dialog: HTMLDialogElement): () => void {
  open = [...open, dialog];
  refresh();
  return () => {
    open = open.filter((item) => item !== dialog);
    refresh();
  };
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The box on top, or null when nothing is open. */
export function useTopDialog(): HTMLDialogElement | null {
  return useSyncExternalStore(subscribe, () => top);
}
