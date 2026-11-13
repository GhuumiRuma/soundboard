/** How long saving may take before the page reloads anyway. */
export const SAVE_WAIT_MS = 3000;

interface ReloadDeps {
  /** True while a recording is open. It isn't saved until she says so, so reloading now would throw it away. */
  isBusy(): boolean;
  /** Calls back whenever `isBusy` may have changed. Returns a function that stops listening. */
  watchBusy(listener: () => void): () => void;
  /** Saves her boards, so nothing she just did is lost. */
  save(): Promise<unknown>;
  reload(): void;
}

/**
 * Makes the page reload to pick up a new version, but never while a recording is open: it waits until she is done.
 * The returned function can be called as often as needed. The page only reloads once.
 */
export function createReloader({ isBusy, watchBusy, save, reload }: ReloadDeps): () => void {
  let started = false;

  const go = () => {
    const saved = save().catch(() => undefined);
    const tooLong = new Promise((resolve) => setTimeout(resolve, SAVE_WAIT_MS));
    void Promise.race([saved, tooLong]).then(reload);
  };

  return () => {
    if (started) return;
    started = true;
    if (!isBusy()) {
      go();
      return;
    }
    let stop: (() => void) | undefined;
    stop = watchBusy(() => {
      if (isBusy()) return;
      stop?.();
      go();
    });
  };
}
