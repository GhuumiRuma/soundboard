/**
 * What a backup file looks like, and the rules for naming things inside it.
 *
 * A backup is one ZIP file, so she can keep it anywhere and can still get her sound files out by hand:
 *   boards.json        her boards, sounds, volumes and keys
 *   sounds/Name.wav    one audio file for each sound
 *   README.txt         a few words for anyone who opens it
 */

export const BACKUP_FORMAT = 'soundboard-backup';
export const BACKUP_VERSION = 1;
export const MANIFEST_NAME = 'boards.json';
export const SOUNDS_FOLDER = 'sounds';
export const README_NAME = 'README.txt';

/** The most one backup can hold, and the biggest backup that will be opened. */
export const MAX_BACKUP_BYTES = 500 * 1024 * 1024;
/** boards.json is only text. One much bigger than this did not come from this app. */
export const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
/** A file name in boards.json that is longer than this is nonsense. */
export const MAX_FILE_REF_LENGTH = 500;

export const README_TEXT = [
  'This is a Soundboard backup.',
  '',
  "Don't unzip it. To get your sounds back, open Soundboard, go to Settings and choose Restore from a backup.",
  'Your sound files are in the "sounds" folder in case you ever want one of them on its own.',
  '',
].join('\r\n');

/** One sound as the backup file describes it. The audio is in its own file, named by `file`. */
export interface BackupSoundEntry {
  id: string;
  name: string;
  emoji: string;
  color: string;
  volume: number;
  hotkey: string | null;
  originalFileName: string | null;
  /** Where the audio is inside the backup, like "sounds/Airhorn.wav". */
  file: string;
}

export interface BackupBoardEntry {
  id: string;
  name: string;
  sounds: BackupSoundEntry[];
}

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  /** When the backup was made, as an ISO date. */
  createdAt: string;
  appVersion: string;
  masterVolume: number;
  stopAllKey: string | null;
  boards: BackupBoardEntry[];
}

/** Why a sound couldn't be brought back. */
export type SkipReason = 'missing' | 'tooBig' | 'broken';

export interface SkippedSound {
  name: string;
  reason: SkipReason;
}

const two = (n: number): string => String(n).padStart(2, '0');

/** "Soundboard backup 2025-05-12.zip", with her own date. */
export function backupFileName(now: Date): string {
  return `Soundboard backup ${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}.zip`;
}

const UNSAFE_IN_FILE_NAMES = /[\\/:*?"<>|\p{Cc}]/gu;
// Windows can't make a file with one of these names, even with an extension after it.
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** A sound's name turned into something every kind of computer accepts as a file name (without the ending). */
export function safeFileStem(name: string, fallback = 'Sound', maxLength = 60): string {
  const tidy = (text: string) => text.replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '');
  let stem = tidy(name.replace(UNSAFE_IN_FILE_NAMES, ' '));
  stem = tidy(Array.from(stem).slice(0, maxLength).join(''));
  if (stem === '') stem = fallback;
  return WINDOWS_RESERVED.test(stem) ? `${stem} sound` : stem;
}

/**
 * A place for a sound inside the backup, like "sounds/Airhorn.wav", that nothing else has taken yet.
 * Two sounds with the same name become "Airhorn.wav" and "Airhorn (2).wav". Capitals don't count as different,
 * because Windows and Mac would put them on top of each other if the backup were ever unzipped.
 */
export function uniqueEntryName(taken: Set<string>, soundName: string, ext: string): string {
  const stem = safeFileStem(soundName);
  let name = `${SOUNDS_FOLDER}/${stem}.${ext}`;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${SOUNDS_FOLDER}/${stem} (${n}).${ext}`;
  taken.add(name.toLowerCase());
  return name;
}
