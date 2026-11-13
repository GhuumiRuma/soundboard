/**
 * "Deleted. Undo" for every delete in the app. Ported from StreamStudio's UndoService.
 *
 * The page removes the item straight away and offers a way to put it back. Offers stack: the bar shows the newest one,
 * Undo restores the newest, and each offer runs out on its own timer, after which its `commit` step runs
 * (for example, throwing away the sound's audio file). Pending commits are dropped on purpose when the page closes:
 * the cleanup at the next start removes any file that nothing uses any more.
 */

/** How long Undo is offered. */
export const UNDO_WINDOW_MS = 10_000;

export interface UndoRequest {
  /** Plain words, like `Deleted “Airhorn”`. */
  message: string;
  /** Puts the item back. It runs at most once, and never after `commit`. */
  undo: () => void;
  /** The final step, once Undo is no longer possible. */
  commit?: () => void;
  /** Audio files Undo could still bring back, so they aren't thrown away yet. */
  holds?: readonly string[];
  windowMs?: number;
}

/** What the bar shows: the newest offer that can still be undone. */
export interface UndoOffer {
  id: number;
  message: string;
  /** A time in milliseconds. */
  expiresAt: number;
  /** How many offers are waiting, this one included. */
  pending: number;
}

interface Entry extends UndoRequest {
  id: number;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}

function run(step: (() => void) | undefined, what: string): void {
  if (!step) return;
  try {
    step();
  } catch (error) {
    console.warn(`The ${what} step failed.`, error);
  }
}

export class UndoStack {
  private entries: Entry[] = [];
  private nextId = 1;
  private offer_: UndoOffer | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly now: () => number = Date.now) {}

  /** For useSyncExternalStore. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** For useSyncExternalStore. The same object comes back until something changes. */
  readonly getOffer = (): UndoOffer | null => this.offer_;

  offer(request: UndoRequest): void {
    const windowMs = request.windowMs && request.windowMs > 0 ? request.windowMs : UNDO_WINDOW_MS;
    const entry: Entry = {
      ...request,
      id: this.nextId++,
      expiresAt: this.now() + windowMs,
      timer: setTimeout(() => this.expire(entry), windowMs),
    };
    this.entries.push(entry);
    this.changed();
  }

  /** Undoes the newest offer. False when there's nothing to undo. */
  undoLatest(): boolean {
    const entry = this.entries.pop();
    if (!entry) return false;
    clearTimeout(entry.timer);
    run(entry.undo, 'undo');
    this.changed();
    return true;
  }

  /** Hides the newest offer and finishes it now. */
  dismiss(): void {
    const entry = this.entries.pop();
    if (!entry) return;
    clearTimeout(entry.timer);
    run(entry.commit, 'cleanup');
    this.changed();
  }

  /** The audio files that Undo could still bring back. */
  held(): Set<string> {
    return new Set(this.entries.flatMap((entry) => entry.holds ?? []));
  }

  /** Stops the timers without running anything. */
  dispose(): void {
    for (const entry of this.entries) clearTimeout(entry.timer);
    this.entries = [];
    this.offer_ = null;
    this.listeners.clear();
  }

  private expire(entry: Entry): void {
    const index = this.entries.indexOf(entry);
    if (index < 0) return;
    this.entries.splice(index, 1);
    run(entry.commit, 'cleanup');
    this.changed();
  }

  private changed(): void {
    const newest = this.entries[this.entries.length - 1];
    this.offer_ = newest
      ? { id: newest.id, message: newest.message, expiresAt: newest.expiresAt, pending: this.entries.length }
      : null;
    for (const listener of [...this.listeners]) listener();
  }
}
