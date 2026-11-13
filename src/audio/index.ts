import { isTouchDevice } from '../lib/device';
import { getStorage } from '../storage';
import { DEFAULT_BUDGET_BYTES, SoundEngine, type AudioContextLike } from './engine';

export * from './engine';
export { gainFor, effectiveGain, toPercent } from './volume';
export { setAudioSession } from './session';

/** Phones have less memory to spare for sounds that are ready to play. */
const TOUCH_BUDGET_BYTES = 64 * 1024 * 1024;

let engine: SoundEngine | undefined;

/** The one sound engine the whole app shares. */
export function getEngine(): SoundEngine {
  engine ??= new SoundEngine({
    createContext: () => {
      const Context = window.AudioContext ?? window.webkitAudioContext;
      if (!Context) return null;
      return new Context({ latencyHint: 'interactive' }) as unknown as AudioContextLike;
    },
    loadMedia: async (mediaId) => {
      const record = await getStorage().getMedia(mediaId);
      return record ? { data: record.data, ext: record.ext } : undefined;
    },
    mediaSizes: () => getStorage().mediaSizes(),
    budgetBytes: isTouchDevice() ? TOUCH_BUDGET_BYTES : DEFAULT_BUDGET_BYTES,
  });
  return engine;
}

/**
 * Browsers only let sound start from a tap or a key press, and iPhones pause it after a call or when you switch apps.
 * So every tap and key press, anywhere on the page, gets the sound system ready (and wakes it up if it was paused).
 * Not `pointerdown` or `touchstart`: iPhone doesn't count those.
 */
export function installAudioUnlock(): () => void {
  const wake = () => getEngine().unlock();
  const comeBack = () => {
    if (document.visibilityState === 'visible') getEngine().recover();
  };
  const events = ['click', 'touchend', 'keydown', 'pointerup'] as const;
  for (const type of events) window.addEventListener(type, wake, { capture: true, passive: true });
  document.addEventListener('visibilitychange', comeBack);
  window.addEventListener('pageshow', comeBack);
  return () => {
    for (const type of events) window.removeEventListener(type, wake, { capture: true });
    document.removeEventListener('visibilitychange', comeBack);
    window.removeEventListener('pageshow', comeBack);
  };
}
