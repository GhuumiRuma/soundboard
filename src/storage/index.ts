import { IdbStorage } from './idb';
import { MemoryStorage } from './memory';
import type { StorageBackend } from './types';

export * from './types';
export { MAX_SOUND_BYTES, importMessages, readSoundFile, checkSoundBytes, mimeForExt, type AudioExt } from './import';
export { sweepUnusedMedia, unusedMediaIds, countMediaReferences } from './media';
export { createSaver, type Saver } from './saver';

let current: StorageBackend | null = null;

/**
 * Opens the storage on this device. If the browser won't keep anything for us, this still works, but the
 * sounds only live until the page is closed (`persistent` is false, so the screen can say so).
 */
export async function openStorage(): Promise<StorageBackend> {
  if (current) return current;
  try {
    current = await IdbStorage.open();
    // The browser may agree not to clear these sounds when it's short of room.
    void current.requestPersistence();
  } catch {
    current = new MemoryStorage(false);
  }
  return current;
}

export function getStorage(): StorageBackend {
  if (!current) throw new Error('The storage has not been opened yet.');
  return current;
}
