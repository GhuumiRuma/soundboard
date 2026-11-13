/** How often an open Soundboard looks for a newer version. */
export const CHECK_EVERY_MS = 60 * 60 * 1000;
/** Coming back to Soundboard looks again, but not more often than this. */
export const CHECK_ON_RETURN_MS = 10 * 60 * 1000;

interface Checkable {
  update(): Promise<unknown>;
}

interface Page {
  readonly visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/**
 * Looks for a newer version every hour, and when she comes back to Soundboard after a while. A phone keeps the
 * app open in the background for days, and the browser only checks when the page loads. Returns a function that stops.
 */
export function watchForUpdates(
  registration: Checkable,
  page: Page = document,
  now: () => number = Date.now,
): () => void {
  let lastCheck = now();

  const check = () => {
    lastCheck = now();
    // No internet right now, or the server is busy. The next check tries again.
    registration.update().catch(() => undefined);
  };

  const onVisibilityChange = () => {
    if (page.visibilityState === 'visible' && now() - lastCheck >= CHECK_ON_RETURN_MS) check();
  };

  const timer = setInterval(check, CHECK_EVERY_MS);
  page.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    clearInterval(timer);
    page.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
