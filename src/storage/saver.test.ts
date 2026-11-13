import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBoards, setMasterVolume } from '../model/boards';
import { createSaver } from './saver';

describe('createSaver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits a moment, then saves only the latest version', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createSaver(save, vi.fn(), 300);
    const base = emptyBoards();
    saver.schedule(setMasterVolume(base, 0.1));
    saver.schedule(setMasterVolume(base, 0.2));
    saver.schedule(setMasterVolume(base, 0.3));
    expect(saver.hasPending()).toBe(true);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(299);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0].masterVolume).toBe(0.3);
    await saver.flush();
    expect(saver.hasPending()).toBe(false);
  });

  it('saves straight away when asked, and waits until it is done', async () => {
    let finished = false;
    const save = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      finished = true;
    });
    const saver = createSaver(save, vi.fn());
    saver.schedule(emptyBoards());
    const flushing = saver.flush();
    expect(save).toHaveBeenCalledOnce();
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(50);
    await flushing;
    expect(finished).toBe(true);
  });

  it("doesn't save twice for one change", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createSaver(save, vi.fn());
    saver.schedule(emptyBoards());
    await saver.flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledOnce();
  });

  it('does nothing when there is nothing to save', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createSaver(save, vi.fn());
    await saver.flush();
    expect(save).not.toHaveBeenCalled();
    expect(saver.hasPending()).toBe(false);
  });

  it('saves one thing at a time, in order', async () => {
    const order: string[] = [];
    const save = vi.fn(async (data: { masterVolume: number }) => {
      order.push(`start ${data.masterVolume}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
      order.push(`end ${data.masterVolume}`);
    });
    const saver = createSaver(save, vi.fn());
    saver.schedule(setMasterVolume(emptyBoards(), 0.4));
    const first = saver.flush();
    saver.schedule(setMasterVolume(emptyBoards(), 0.6));
    const second = saver.flush();
    await vi.advanceTimersByTimeAsync(300);
    await Promise.all([first, second]);
    expect(order).toEqual(['start 0.4', 'end 0.4', 'start 0.6', 'end 0.6']);
  });

  it('tells the screen when saving fails, and keeps working afterwards', async () => {
    const problem = new Error('no room');
    const save = vi.fn().mockRejectedValueOnce(problem).mockResolvedValue(undefined);
    const onError = vi.fn();
    const saver = createSaver(save, onError);
    saver.schedule(emptyBoards());
    await saver.flush();
    expect(onError).toHaveBeenCalledWith(problem);
    saver.schedule(emptyBoards());
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('keeps saving even if the message about a failure goes wrong', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('no room')).mockResolvedValue(undefined);
    const saver = createSaver(save, () => {
      throw new Error('the message broke');
    });
    saver.schedule(emptyBoards());
    await saver.flush();
    saver.schedule(emptyBoards());
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('counts a save that is still being written as unfinished', async () => {
    const save = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 100)));
    const saver = createSaver(save, vi.fn());
    saver.schedule(emptyBoards());
    const flushing = saver.flush();
    expect(saver.hasPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    await flushing;
    expect(saver.hasPending()).toBe(false);
  });
});
