import { webPlatform } from './web';
import type { Platform } from './types';

declare global {
  interface Window {
    Capacitor?: { isNativePlatform?: () => boolean };
    __TAURI_INTERNALS__?: unknown;
  }
}

let current: Platform = webPlatform;

/** The platform the app is running on. Safe to call at any time; it is the web one until `initPlatform()` has run. */
export function getPlatform(): Platform {
  return current;
}

/**
 * Picks the Android app, the desktop installer or the web version, then lets it get ready.
 * The web build never loads the other two: `__NATIVE_BUILD__` is false there, so those branches are cut out.
 */
export async function initPlatform(): Promise<Platform> {
  if (__NATIVE_BUILD__ && typeof window !== 'undefined') {
    if (window.__TAURI_INTERNALS__ !== undefined) {
      current = (await import('./tauri')).tauriPlatform;
    } else if (window.Capacitor?.isNativePlatform?.()) {
      current = (await import('./capacitor')).capacitorPlatform;
    }
  }
  await current.init?.();
  return current;
}

export type { FileToSave, Platform, PlatformKind, SaveOutcome, SoundKeyBinding, SoundKeyHost } from './types';
