import { plural } from '../lib/plural';
import { importMessages } from '../storage/import';
import type { SkippedSound, SkipReason } from './format';

/** What the backup screens tell her. Plain words: what happened, and what to do next. */
export const backupMessages = {
  nothingToSave: "You don't have any sounds to back up yet. Add a sound first.",
  filesGone: "I couldn't find your sound files on this device, so there's nothing to put in a backup.",
  tooBigToSave:
    "Your sounds add up to more than 500 MB, which is too much for one backup. Delete a few you don't need, then try again.",
  couldNotSave: "I couldn't make the backup. Please try again.",
  notABackup:
    "That doesn't look like a Soundboard backup. Pick a file called “Soundboard backup …” that ends in .zip.",
  damaged:
    "I couldn't read that backup. It may be damaged, or it may not have finished saving. Try another copy.",
  newer: 'That backup was made by a newer version of Soundboard. Update the app, then try again.',
  tooBigToOpen: 'That backup is too big to open here (the limit is 500 MB).',
  noSounds: 'There are no sounds in that backup.',
  noneOpened: "I couldn't open any of the sounds in that backup. It may be damaged. Try another copy.",
  restoreFailed: "I couldn't restore that backup. Nothing has been changed. Please try again.",
  noRoom: "There isn't enough room on this device for that backup. Free up some space, then try again. Nothing has been changed.",
  reminder: 'Keep your sounds safe. Clearing your browser data or uninstalling the app deletes them.',
  intro:
    'A backup is one file with all your boards and sounds. Clearing your browser data or uninstalling the app deletes your sounds, so keep a copy somewhere safe, like cloud storage or a USB stick.',
  pickHint: "Pick a backup file you saved before (it ends in .zip). Don't unzip it first.",
} as const;

/** The Undo bar's words after a backup replaced everything. */
export const restoredMessage = (boards: number, sounds: number): string =>
  `Restored your backup: ${plural(boards, 'board')} and ${plural(sounds, 'sound')}`;

/** The Undo bar's words after a backup was added to what she already had. */
export function addedMessage(boards: number, sounds: number, keysLeftOff: number): string {
  const added = `Added ${plural(boards, 'board')} and ${plural(sounds, 'sound')} from your backup`;
  if (keysLeftOff === 0) return added;
  const keys = keysLeftOff === 1 ? '1 sound key was' : `${keysLeftOff} sound keys were`;
  return `${added}. ${keys} already in use, so I left ${keysLeftOff === 1 ? 'it' : 'them'} off.`;
}

const SKIP_WHY: Record<SkipReason, string> = {
  missing: "Its file isn't in the backup.",
  tooBig: importMessages.tooBig,
  broken: "Its file is damaged, or isn't a sound I can use (MP3, WAV or OGG).",
};

/** How many sounds are named one by one before the rest are only counted. */
const NAMED_AT_MOST = 3;

/** One message for each of the first few sounds that couldn't be brought back, then a count of the rest. */
export function skippedMessages(skipped: readonly SkippedSound[]): string[] {
  const lines = [...new Set(skipped.map((s) => `“${s.name}” wasn't restored. ${SKIP_WHY[s.reason]}`))];
  if (lines.length <= NAMED_AT_MOST) return lines;
  const more = lines.length - NAMED_AT_MOST;
  const rest = more === 1 ? "…and 1 more sound wasn't restored." : `…and ${more} more sounds weren't restored.`;
  return [...lines.slice(0, NAMED_AT_MOST), rest];
}

/** What to say when some sounds couldn't go into a backup because their files are gone from this device. */
export function leftOutMessage(names: readonly string[]): string {
  const shown = names.slice(0, NAMED_AT_MOST).map((name) => `“${name}”`);
  const rest = names.length - shown.length;
  const list = rest > 0 ? `${shown.join(', ')} and ${plural(rest, 'other')}` : shown.join(', ');
  const files = names.length === 1 ? 'its file' : 'their files';
  return `${plural(names.length, 'sound')} couldn't go into the backup because I couldn't find ${files} on this device: ${list}.`;
}

const DAY = 24 * 60 * 60 * 1000;

/** "Your last backup was yesterday." Counts whole days on her calendar, so a backup at 11 pm is "yesterday" at 1 am. */
export function lastBackupText(at: number | null, now: number): string {
  if (at === null) return "You haven't saved a backup yet.";
  const a = new Date(at);
  const b = new Date(now);
  const days = Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY,
  );
  if (days <= 0) return 'Your last backup was today.';
  if (days === 1) return 'Your last backup was yesterday.';
  if (days < 60) return `Your last backup was ${days} days ago.`;
  const date = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(a);
  return `Your last backup was on ${date}.`;
}

/** Something that went wrong with a backup, in words that are safe to show to her as they are. */
export class BackupProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupProblem';
  }
}
