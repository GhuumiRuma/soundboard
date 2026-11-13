import { useSyncExternalStore } from 'react';
import type { DeviceOs } from '../lib/device';
import { getPlatform } from '../platform';
import { getBoardStore } from '../state';
import { playSound, stopAllSounds } from '../state/actions';
import type { KeyPlace } from './clashes';
import { createSoundKeyService, type SoundKeyService, type SoundKeyStatus } from './service';

let service: SoundKeyService | undefined;

/** Where sound keys work on this device (only the window, or every app) and which names its keys have. */
export function keyPlace(): KeyPlace & { os: DeviceOs } {
  const platform = getPlatform();
  return { global: platform.soundKeys.global, os: platform.os };
}

/** The one sound-keys service for the app. It works out which keys to listen for from her boards and the on/off switch. */
export function getSoundKeys(): SoundKeyService {
  service ??= createSoundKeyService({
    source: getBoardStore().state,
    host: () => getPlatform().soundKeys,
    actions: { play: (id) => playSound(id), stopAll: stopAllSounds },
  });
  return service;
}

/** Starts listening for sound keys. Call it once, when the app opens. */
export function startSoundKeys(): () => void {
  return getSoundKeys().start();
}

/** Switches every sound key off until the returned function is called. The key recorder uses this while she picks a key. */
export function suspendSoundKeys(): () => void {
  return getSoundKeys().suspend();
}

/** Whether a sound key could not be taken (another program has it), so the page can say so. */
export function useSoundKeyStatus(): SoundKeyStatus {
  const keys = getSoundKeys();
  return useSyncExternalStore(keys.subscribe, keys.getStatus);
}
