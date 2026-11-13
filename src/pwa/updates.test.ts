import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHECK_EVERY_MS, CHECK_ON_RETURN_MS, watchForUpdates } from './updates';

class FakePage extends EventTarget {
  visibilityState = 'visible';

  go(state: 'visible' | 'hidden') {
    this.visibilityState = state;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

const quiet = () => ({ update: vi.fn(async () => undefined) });

// Taken before the fake timers go in, so a test can still wait for a real moment to pass.
const realSetTimeout = globalThis.setTimeout;
const aRealMoment = () => new Promise<void>((resolve) => realSetTimeout(resolve, 20));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('watchForUpdates', () => {
  it('looks for a new version every hour', () => {
    const registration = quiet();
    watchForUpdates(registration, new FakePage());
    expect(registration.update).not.toHaveBeenCalled();
    vi.advanceTimersByTime(CHECK_EVERY_MS);
    expect(registration.update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(CHECK_EVERY_MS * 2);
    expect(registration.update).toHaveBeenCalledTimes(3);
  });

  it('looks again when she comes back after a while', () => {
    const registration = quiet();
    const page = new FakePage();
    watchForUpdates(registration, page);
    page.go('hidden');
    vi.advanceTimersByTime(CHECK_ON_RETURN_MS);
    expect(registration.update).not.toHaveBeenCalled();
    page.go('visible');
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('does not look every time she switches back and forth', () => {
    const registration = quiet();
    const page = new FakePage();
    watchForUpdates(registration, page);
    vi.advanceTimersByTime(CHECK_ON_RETURN_MS - 1000);
    page.go('hidden');
    page.go('visible');
    expect(registration.update).not.toHaveBeenCalled();
  });

  it('counts from the last look, however it started', () => {
    const registration = quiet();
    const page = new FakePage();
    watchForUpdates(registration, page);
    vi.advanceTimersByTime(CHECK_EVERY_MS);
    expect(registration.update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(CHECK_ON_RETURN_MS - 1000);
    page.go('visible');
    expect(registration.update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    page.go('visible');
    expect(registration.update).toHaveBeenCalledTimes(2);
  });

  it('does nothing while the page is hidden', () => {
    const registration = quiet();
    const page = new FakePage();
    watchForUpdates(registration, page);
    vi.advanceTimersByTime(CHECK_ON_RETURN_MS * 2);
    page.go('hidden');
    expect(registration.update).not.toHaveBeenCalled();
  });

  it('shrugs off a check that fails because there is no internet', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      // Not a vi.fn(): a spy quietly handles the promise it returns, which would hide the problem.
      let looked = 0;
      const registration = {
        update: () => {
          looked += 1;
          return Promise.reject(new TypeError('Failed to fetch'));
        },
      };
      watchForUpdates(registration, new FakePage());
      vi.advanceTimersByTime(CHECK_EVERY_MS);
      await aRealMoment();
      expect(looked).toBe(1);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('stops when told to', () => {
    const registration = quiet();
    const page = new FakePage();
    const stop = watchForUpdates(registration, page);
    stop();
    vi.advanceTimersByTime(CHECK_EVERY_MS * 2);
    vi.advanceTimersByTime(CHECK_ON_RETURN_MS);
    page.go('visible');
    expect(registration.update).not.toHaveBeenCalled();
  });
});
