import { vi } from 'vitest';
import type { AudioBufferLike, PlayResult } from '../audio/engine';
import type { BoardEngine } from '../state/board';

/** A sound engine that makes no sound. Every method is a mock, so a test can check how it was used. */
export function fakeEngine(overrides: Partial<BoardEngine> = {}) {
  return {
    play: vi.fn(async (): Promise<PlayResult> => ({ ok: true })),
    stopAll: vi.fn(),
    setMasterVolume: vi.fn(),
    setSoundVolume: vi.fn(),
    decode: vi.fn(async () => ({ length: 1, numberOfChannels: 1, duration: 0.25 }) as AudioBufferLike),
    remember: vi.fn(),
    forget: vi.fn(),
    preload: vi.fn(async () => undefined),
    ...overrides,
  };
}
