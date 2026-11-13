import type { BoardsData } from '../model/types';

export interface Saver {
  /** Saves soon. If she keeps changing things, only the latest version is saved. */
  schedule(data: BoardsData): void;
  /** Saves right now and waits until everything is written. */
  flush(): Promise<void>;
  /** Whether something is waiting to be saved, or is being saved right now. */
  hasPending(): boolean;
}

/**
 * Saves her boards a moment after she stops changing things (so dragging a volume doesn't write on every pixel),
 * and straight away when asked. Writes happen one at a time, in order.
 */
export function createSaver(save: (data: BoardsData) => Promise<void>, onError: (error: unknown) => void, delayMs = 300): Saver {
  let pending: BoardsData | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | null = null;

  function flush(): Promise<void> {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (pending) {
      const data = pending;
      pending = null;
      const attempt = async () => {
        try {
          await save(data);
        } catch (error) {
          try {
            onError(error);
          } catch {
            // Nothing more can be done, and the next save must still go ahead.
          }
        }
      };
      const next: Promise<void> = running ? running.then(attempt) : attempt();
      running = next;
      void next.then(() => {
        if (running === next) running = null;
      });
    }
    return running ?? Promise.resolve();
  }

  return {
    schedule(data) {
      pending = data;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => void flush(), delayMs);
    },
    flush,
    hasPending: () => pending !== null || running !== null,
  };
}
