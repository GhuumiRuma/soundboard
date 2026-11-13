import { strFromU8, unzipSync } from 'fflate';
import { newId } from '../lib/id';
import { normalizeBoards, soundCount } from '../model/boards';
import type { BoardsData, SoundItem } from '../model/types';
import { MAX_SOUND_BYTES, checkSoundBytes, importMessages } from '../storage/import';
import type { NewMedia } from '../storage/types';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  MANIFEST_NAME,
  MAX_BACKUP_BYTES,
  MAX_FILE_REF_LENGTH,
  MAX_MANIFEST_BYTES,
  type SkipReason,
  type SkippedSound,
} from './format';
import { BackupProblem, backupMessages } from './messages';

/** A backup that has been read and checked, ready to be put on the device. Nothing has been kept yet. */
export interface OpenedBackup {
  /** When the backup was made, or null when the file doesn't say. */
  createdAt: Date | null;
  /** Her boards from the backup, tidied the same way as anything she types, with new ids. */
  data: BoardsData;
  /** The audio files to keep. Each sound in `data` uses one of them by its id. */
  media: (NewMedia & { id: string })[];
  boards: number;
  sounds: number;
  /** Sounds the backup mentions that can't be brought back, and why. */
  skipped: SkippedSound[];
}

type Record_ = Record<string, unknown>;

const isRecord = (value: unknown): value is Record_ => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Zip files from Windows, Mac and phones disagree about slashes, capitals and accents, so names are compared in one shape. */
const entryKey = (name: string): string => name.replace(/\\/g, '/').replace(/^(\.?\/)+/, '').normalize('NFC').toLowerCase();

/** Things Macs and Windows add to a zip on their own. They are never part of a backup. */
const isJunk = (key: string): boolean =>
  key.endsWith('/') || key.startsWith('__macosx/') || /(^|\/)(\.ds_store|thumbs\.db|desktop\.ini|\._[^/]*)$/.test(key);

/** Every zip file starts with "PK" and one of these. */
const looksLikeZip = (bytes: Uint8Array): boolean =>
  bytes[0] === 0x50 && bytes[1] === 0x4b && ((bytes[2] === 3 && bytes[3] === 4) || (bytes[2] === 5 && bytes[3] === 6));

/** Anything that goes wrong while unpacking means the file is damaged. Problems with friendlier words pass through. */
function guard<T>(job: () => T): T {
  try {
    return job();
  } catch (error) {
    if (error instanceof BackupProblem) throw error;
    throw new BackupProblem(backupMessages.damaged);
  }
}

/** boards.json is at the top of the zip. If she unzipped and zipped it again, it sits in one folder instead. */
function findManifest(bytes: Uint8Array): { text: Uint8Array; folder: string } {
  const files = unzipSync(bytes, {
    filter(info) {
      const key = entryKey(info.name);
      if (isJunk(key)) return false;
      const parts = key.split('/');
      if (parts.length > 2 || parts[parts.length - 1] !== MANIFEST_NAME) return false;
      if (info.originalSize > MAX_MANIFEST_BYTES) throw new BackupProblem(backupMessages.notABackup);
      return true;
    },
  });
  const [first] = Object.keys(files).sort((a, b) => entryKey(a).split('/').length - entryKey(b).split('/').length);
  if (first === undefined) throw new BackupProblem(backupMessages.notABackup);
  const key = entryKey(first);
  const slash = key.lastIndexOf('/');
  return { text: files[first], folder: slash < 0 ? '' : key.slice(0, slash + 1) };
}

function parseManifest(text: Uint8Array): Record_ {
  let json: unknown;
  try {
    json = JSON.parse(strFromU8(text).replace(/^\uFEFF/, ''));
  } catch {
    throw new BackupProblem(backupMessages.damaged);
  }
  if (!isRecord(json) || json.format !== BACKUP_FORMAT) throw new BackupProblem(backupMessages.notABackup);
  const version = json.version;
  if (typeof version !== 'number' || !Number.isFinite(version) || version < 1) throw new BackupProblem(backupMessages.damaged);
  if (version > BACKUP_VERSION) throw new BackupProblem(backupMessages.newer);
  return json;
}

type Extracted = Uint8Array | 'tooBig';

/**
 * Unpacks only the audio files boards.json asks for. A file's size is checked before it is unpacked, so a file that
 * claims to be enormous never takes the memory.
 */
function extractFiles(bytes: Uint8Array, folder: string, refs: readonly string[]): Map<string, Extracted> {
  const wanted = new Set(refs.map((ref) => folder + entryKey(ref)));
  const tooBig = new Set<string>();
  let total = 0;
  const files = unzipSync(bytes, {
    filter(info) {
      const key = entryKey(info.name);
      if (!wanted.has(key)) return false;
      if (info.originalSize > MAX_SOUND_BYTES) {
        tooBig.add(key);
        return false;
      }
      total += info.originalSize;
      if (total > MAX_BACKUP_BYTES) throw new BackupProblem(backupMessages.tooBigToOpen);
      return true;
    },
  });

  const byKey = new Map(Object.entries(files).map(([name, data]) => [entryKey(name), data]));
  const found = new Map<string, Extracted>();
  for (const ref of refs) {
    const key = folder + entryKey(ref);
    const data = tooBig.has(key) ? 'tooBig' : byKey.get(key);
    if (data !== undefined) found.set(ref, data);
  }
  return found;
}

type Checked = { ok: true; media: NewMedia & { id: string } } | { ok: false; reason: SkipReason };

/** What is inside a file decides whether it is a sound, never its name. Each sound file gets a new id. */
function checkFile(entry: Extracted | undefined): Checked {
  if (entry === undefined) return { ok: false, reason: 'missing' };
  if (entry === 'tooBig') return { ok: false, reason: 'tooBig' };
  const checked = checkSoundBytes(entry.slice().buffer);
  if (checked.ok) return { ok: true, media: { id: newId(), data: checked.bytes, ext: checked.ext, mime: checked.mime } };
  return { ok: false, reason: checked.message === importMessages.tooBig ? 'tooBig' : 'broken' };
}

const NO_FILE = 'no-file';

function soundsOf(board: unknown): Record_[] {
  return isRecord(board) && Array.isArray(board.sounds) ? board.sounds.filter(isRecord) : [];
}

/**
 * Reads a backup that is already in memory and checks all of it: it is a backup from this app, it isn't too big,
 * and every audio file really is a sound. Everything in it is tidied the same way as anything she types, and every
 * board, sound and audio file gets a new id, so it can never clash with what is on the device.
 * A sound whose file is missing or broken is left out and listed in `skipped`. Throws a BackupProblem when the whole
 * file is no use.
 */
export function openBackupBytes(bytes: Uint8Array): OpenedBackup {
  if (!looksLikeZip(bytes)) throw new BackupProblem(backupMessages.notABackup);
  const { text, folder } = guard(() => findManifest(bytes));
  const manifest = parseManifest(text);
  const rawBoards: unknown[] = Array.isArray(manifest.boards) ? manifest.boards : [];

  const refOf = (sound: Record_): string | null =>
    typeof sound.file === 'string' && sound.file.trim() !== '' && sound.file.length <= MAX_FILE_REF_LENGTH ? sound.file : null;

  const refs: string[] = [];
  const refNumber = new Map<string, number>();
  for (const board of rawBoards) {
    for (const sound of soundsOf(board)) {
      const ref = refOf(sound);
      if (ref !== null && !refNumber.has(ref)) {
        refNumber.set(ref, refs.length);
        refs.push(ref);
      }
    }
  }

  const extracted = guard(() => extractFiles(bytes, folder, refs));
  const checked = refs.map((ref) => checkFile(extracted.get(ref)));

  // Each sound is pointed at its file by number for now, so the usual tidying keeps it and it can be reported if it has no file.
  const keyOf = (sound: Record_): string => {
    const ref = refOf(sound);
    return ref === null ? NO_FILE : String(refNumber.get(ref));
  };
  const tidy = normalizeBoards({
    ...manifest,
    boards: rawBoards.map((board) =>
      isRecord(board) ? { ...board, sounds: soundsOf(board).map((sound) => ({ ...sound, mediaId: keyOf(sound) })) } : board,
    ),
  });

  const used = new Set<number>();
  const skipped: SkippedSound[] = [];
  const boards = tidy.boards.map((board) => ({
    id: newId(),
    name: board.name,
    sounds: board.sounds.flatMap((sound): SoundItem[] => {
      const number = sound.mediaId === NO_FILE ? -1 : Number(sound.mediaId);
      const result = checked[number];
      if (!result) {
        skipped.push({ name: sound.name, reason: 'missing' });
        return [];
      }
      if (!result.ok) {
        skipped.push({ name: sound.name, reason: result.reason });
        return [];
      }
      used.add(number);
      return [{ ...sound, id: newId(), mediaId: result.media.id }];
    }),
  }));

  // A last tidy-up, in case anything above let something odd through.
  const data = normalizeBoards({ boards, masterVolume: tidy.masterVolume, stopAllKey: tidy.stopAllKey });
  const sounds = soundCount(data);
  if (sounds === 0) throw new BackupProblem(skipped.length > 0 ? backupMessages.noneOpened : backupMessages.noSounds);

  const media: OpenedBackup['media'] = [];
  for (const number of used) {
    const result = checked[number];
    if (result.ok) media.push(result.media);
  }

  const made = typeof manifest.createdAt === 'string' ? new Date(manifest.createdAt) : null;
  return {
    createdAt: made && !Number.isNaN(made.getTime()) ? made : null,
    data,
    media,
    boards: data.boards.length,
    sounds,
    skipped,
  };
}

/** Reads the backup file she picked. */
export async function openBackup(file: Blob): Promise<OpenedBackup> {
  if (file.size > MAX_BACKUP_BYTES) throw new BackupProblem(backupMessages.tooBigToOpen);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new BackupProblem(importMessages.unreadable);
  }
  return openBackupBytes(bytes);
}
