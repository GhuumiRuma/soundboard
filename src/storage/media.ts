import { allSounds } from '../model/boards';
import type { BoardsData } from '../model/types';
import type { StorageBackend } from './types';

/** How many sounds use each audio file. A file two sounds share counts twice. */
export function countMediaReferences(data: BoardsData): Map<string, number> {
  const counts = new Map<string, number>();
  for (const sound of allSounds(data)) counts.set(sound.mediaId, (counts.get(sound.mediaId) ?? 0) + 1);
  return counts;
}

/**
 * The stored audio files nothing needs any more. A file is only unused when no sound has it
 * and Undo couldn't bring one back (`holding` lists the files of sounds she just deleted).
 */
export function unusedMediaIds(stored: Iterable<string>, data: BoardsData, holding: Iterable<string> = []): string[] {
  const used = countMediaReferences(data);
  const held = new Set(holding);
  return [...stored].filter((id) => !used.has(id) && !held.has(id));
}

/** Throws away the unused audio files, and says which. It never touches a file a sound still uses. */
export async function sweepUnusedMedia(
  storage: StorageBackend,
  data: BoardsData,
  holding: Iterable<string> = [],
): Promise<string[]> {
  const unused = unusedMediaIds(await storage.mediaIds(), data, holding);
  await storage.deleteMedia(unused);
  return unused;
}
