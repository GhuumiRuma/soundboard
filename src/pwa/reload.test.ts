import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReloader, SAVE_WAIT_MS } from './reload';

function setup(busy = false) {
  const listeners = new Set<() => void>();
  const log: string[] = [];
  const state = { busy, saving: Promise.resolve<unknown>(undefined) };
  const reload = vi.fn(() => void log.push('reload'));
  const save = vi.fn(() => {
    log.push('save');
    return state.saving;
  });
  const reloader = createReloader({
    isBusy: () => state.busy,
    watchBusy: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    save,
    reload,
  });
  const change = (nowBusy: boolean) => {
    state.busy = nowBusy;
    [...listeners].forEach((listener) => listener());
  };
  return { reloader, reload, save, state, listeners, log, change };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createReloader', () => {
  it('saves, then reloads', async () => {
    const { reloader, log } = setup();
    reloader();
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toEqual(['save', 'reload']);
  });

  it('only reloads once, however often it is asked', async () => {
    const { reloader, reload, save } = setup();
    reloader();
    reloader();
    reloader();
    await vi.advanceTimersByTimeAsync(SAVE_WAIT_MS + 10);
    expect(save).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('waits for the save to finish', async () => {
    const { reloader, reload, state } = setup();
    let finish: () => void = () => undefined;
    state.saving = new Promise<void>((resolve) => (finish = resolve));
    reloader();
    await vi.advanceTimersByTimeAsync(SAVE_WAIT_MS - 100);
    expect(reload).not.toHaveBeenCalled();
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads anyway when saving takes too long', async () => {
    const { reloader, reload, state } = setup();
    state.saving = new Promise(() => undefined);
    reloader();
    await vi.advanceTimersByTimeAsync(SAVE_WAIT_MS - 100);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads even when saving fails', async () => {
    const { reloader, reload, state } = setup();
    state.saving = Promise.reject(new Error('Disk full'));
    reloader();
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves an open recording alone, and reloads when it is closed', async () => {
    const { reloader, reload, save, change, listeners } = setup(true);
    reloader();
    await vi.advanceTimersByTimeAsync(SAVE_WAIT_MS * 2);
    expect(save).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    change(true);
    expect(reload).not.toHaveBeenCalled();
    change(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });

  it('does not reload twice when asked again while it waits for a recording', async () => {
    const { reloader, reload, change } = setup(true);
    reloader();
    reloader();
    change(false);
    await vi.advanceTimersByTimeAsync(SAVE_WAIT_MS + 10);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
