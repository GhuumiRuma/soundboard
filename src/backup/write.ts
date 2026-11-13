import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';
import { soundCount } from '../model/boards';
import type { BoardsData } from '../model/types';
import type { AudioExt } from '../storage/import';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  MANIFEST_NAME,
  MAX_BACKUP_BYTES,
  README_NAME,
  README_TEXT,
  backupFileName,
  uniqueEntryName,
  type BackupBoardEntry,
  type BackupManifest,
} from './format';
import { BackupProblem, backupMessages } from './messages';

/** A stored audio file, as much of it as a backup needs. */
export interface BackupMedia {
  data: ArrayBuffer;
  ext: AudioExt;
}

export interface MakeBackupInput {
  data: BoardsData;
  /** Reads one stored audio file. Resolves with nothing when the file isn't there any more. */
  readMedia: (mediaId: string) => Promise<BackupMedia | undefined>;
  now?: Date;
  appVersion?: string;
}

export interface MadeBackup {
  blob: Blob;
  fileName: string;
  boards: number;
  sounds: number;
  /** The names of sounds that were left out because their audio file couldn't be found. */
  missing: string[];
}

/** Lets the page redraw (so "Saving your backup…" shows up) between the files of a big backup. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function addFile(zip: Zip, name: string, data: Uint8Array, mtime: Date, compress: boolean): void {
  const entry = compress ? new ZipDeflate(name, { level: 1 }) : new ZipPassThrough(name);
  entry.mtime = mtime;
  zip.add(entry);
  entry.push(data, true);
}

/**
 * Packs her boards and every sound's audio into one ZIP file. MP3 and OGG files are already squeezed, so they go in
 * as they are; WAV files and the text are squeezed a little. Nothing here changes anything she has.
 */
export async function makeBackup(input: MakeBackupInput): Promise<MadeBackup> {
  const { data, readMedia } = input;
  const now = input.now ?? new Date();
  if (soundCount(data) === 0) throw new BackupProblem(backupMessages.nothingToSave);

  const chunks: Uint8Array[] = [];
  let failure: unknown = null;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else chunks.push(chunk);
  });

  const taken = new Set<string>();
  const fileFor = new Map<string, string>();
  const missing: string[] = [];
  const boards: BackupBoardEntry[] = [];
  let bytes = 0;
  let sounds = 0;

  for (const board of data.boards) {
    const entries: BackupBoardEntry['sounds'] = [];
    for (const sound of board.sounds) {
      let file = fileFor.get(sound.mediaId);
      if (file === undefined) {
        const media = await readMedia(sound.mediaId);
        if (!media) {
          missing.push(sound.name);
          continue;
        }
        bytes += media.data.byteLength;
        if (bytes > MAX_BACKUP_BYTES) throw new BackupProblem(backupMessages.tooBigToSave);
        file = uniqueEntryName(taken, sound.name, media.ext);
        fileFor.set(sound.mediaId, file);
        addFile(zip, file, new Uint8Array(media.data), now, media.ext === 'wav');
        await breathe();
      }
      entries.push({
        id: sound.id,
        name: sound.name,
        emoji: sound.emoji,
        color: sound.color,
        volume: sound.volume,
        hotkey: sound.hotkey,
        originalFileName: sound.originalFileName,
        file,
      });
      sounds += 1;
    }
    boards.push({ id: board.id, name: board.name, sounds: entries });
  }

  if (sounds === 0) throw new BackupProblem(backupMessages.filesGone);

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    appVersion: input.appVersion ?? __APP_VERSION__,
    masterVolume: data.masterVolume,
    stopAllKey: data.stopAllKey,
    boards,
  };
  addFile(zip, MANIFEST_NAME, strToU8(JSON.stringify(manifest, null, 2)), now, true);
  addFile(zip, README_NAME, strToU8(README_TEXT), now, true);
  zip.end();
  if (failure) throw failure;

  return {
    blob: new Blob(chunks as BlobPart[], { type: 'application/zip' }),
    fileName: backupFileName(now),
    boards: boards.length,
    sounds,
    missing,
  };
}
