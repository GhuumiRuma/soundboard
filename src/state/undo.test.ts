import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNDO_WINDOW_MS, UndoStack } from './undo';

describe('UndoStack', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const request = (name: string, extra: Partial<Parameters<UndoStack['offer']>[0]> = {}) => {
    const undo = vi.fn();
    const commit = vi.fn();
    return { undo, commit, request: { message: `Deleted “${name}”`, undo, commit, ...extra } };
  };

  it('shows nothing until something is deleted', () => {
    const stack = new UndoStack();
    expect(stack.getOffer()).toBeNull();
    expect(stack.undoLatest()).toBe(false);
    stack.dismiss();
    expect(stack.getOffer()).toBeNull();
  });

  it('offers Undo for 10 seconds, then finishes the delete', () => {
    const stack = new UndoStack();
    const a = request('Airhorn');
    stack.offer(a.request);
    expect(stack.getOffer()).toMatchObject({ message: 'Deleted “Airhorn”', pending: 1 });
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    expect(a.commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(a.commit).toHaveBeenCalledTimes(1);
    expect(a.undo).not.toHaveBeenCalled();
    expect(stack.getOffer()).toBeNull();
  });

  it('undoes the newest delete first and never finishes an undone delete', () => {
    const stack = new UndoStack();
    const a = request('A');
    const b = request('B');
    stack.offer(a.request);
    stack.offer(b.request);
    expect(stack.getOffer()).toMatchObject({ message: 'Deleted “B”', pending: 2 });
    expect(stack.undoLatest()).toBe(true);
    expect(b.undo).toHaveBeenCalledTimes(1);
    expect(stack.getOffer()).toMatchObject({ message: 'Deleted “A”', pending: 1 });
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    expect(b.commit).not.toHaveBeenCalled();
    expect(a.commit).toHaveBeenCalledTimes(1);
  });

  it('gives each delete its own countdown, so an older one does not start again', () => {
    const stack = new UndoStack();
    const a = request('A');
    const b = request('B');
    stack.offer(a.request);
    vi.advanceTimersByTime(6000);
    stack.offer(b.request);
    vi.advanceTimersByTime(4000);
    expect(a.commit).toHaveBeenCalledTimes(1);
    expect(b.commit).not.toHaveBeenCalled();
    expect(stack.getOffer()).toMatchObject({ message: 'Deleted “B”', pending: 1 });
    vi.advanceTimersByTime(6000);
    expect(b.commit).toHaveBeenCalledTimes(1);
  });

  it('dismiss hides the newest one and finishes it now', () => {
    const stack = new UndoStack();
    const a = request('A');
    stack.offer(a.request);
    stack.dismiss();
    expect(a.commit).toHaveBeenCalledTimes(1);
    expect(a.undo).not.toHaveBeenCalled();
    expect(stack.getOffer()).toBeNull();
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    expect(a.commit).toHaveBeenCalledTimes(1);
  });

  it('lists the audio files that Undo could still bring back', () => {
    const stack = new UndoStack();
    stack.offer(request('A', { holds: ['m1'] }).request);
    stack.offer(request('B', { holds: ['m2', 'm3'] }).request);
    expect([...stack.held()].sort()).toEqual(['m1', 'm2', 'm3']);
    stack.undoLatest();
    expect([...stack.held()]).toEqual(['m1']);
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(stack.held().size).toBe(0);
  });

  it('tells listeners when the offer changes, and keeps the same object until then', () => {
    const stack = new UndoStack();
    const listener = vi.fn();
    const stop = stack.subscribe(listener);
    stack.offer(request('A').request);
    const shown = stack.getOffer();
    expect(stack.getOffer()).toBe(shown);
    expect(listener).toHaveBeenCalledTimes(1);
    stack.undoLatest();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    stack.offer(request('B').request);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps going when a step fails', () => {
    const stack = new UndoStack();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    stack.offer({
      message: 'x',
      undo: () => {
        throw new Error('nope');
      },
      commit: () => {
        throw new Error('nope');
      },
    });
    expect(() => stack.undoLatest()).not.toThrow();
    stack.offer({
      message: 'y',
      undo: () => undefined,
      commit: () => {
        throw new Error('nope');
      },
    });
    expect(() => vi.advanceTimersByTime(UNDO_WINDOW_MS)).not.toThrow();
    expect(stack.getOffer()).toBeNull();
    warn.mockRestore();
  });

  it('honours a different window and drops everything on dispose without finishing it', () => {
    const stack = new UndoStack();
    const a = request('A', { windowMs: 2000 });
    stack.offer(a.request);
    vi.advanceTimersByTime(2000);
    expect(a.commit).toHaveBeenCalledTimes(1);
    const b = request('B');
    stack.offer(b.request);
    stack.dispose();
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    expect(b.commit).not.toHaveBeenCalled();
    expect(stack.getOffer()).toBeNull();
  });
});
