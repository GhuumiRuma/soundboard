import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { webPlatform } from './web';
import type { FileToSave, Platform, SaveOutcome } from './types';

/**
 * The Android app (Capacitor).
 *
 * - saveFile copies the file into the app's cache and opens the Android share sheet (Files, Drive, WhatsApp...).
 * - haptic is a short tap from the phone's vibration motor.
 * - setTheme gives the status and navigation bars light or dark icons to suit the look the app is showing.
 * - Sound keys stay the web ones: a keyboard plugged into the phone still sends normal key presses to the page.
 *
 * This file is only loaded inside the Android app (see index.ts), so the plugins are imported straight away.
 */

/** Where files wait for the share sheet, inside the app's cache folder. */
const SHARE_FOLDER = 'share';

/** Bytes per write when handing a file to the native side (base64 grows it by a third). */
const WRITE_CHUNK = 3 * 1024 * 1024;

/** The app that receives a shared file may still be reading its copy long after the sheet closes. */
const SHARE_COPY_KEEP_MS = 24 * 60 * 60 * 1000;

/** The shortest gap between two taps, so a drumroll on the pads doesn't pile up vibrations. */
const MIN_TAP_GAP_MS = 40;

const SAVE_FAILED = "I couldn't save that file. Please try again.";

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** Keeps the name inside one folder and free of characters a computer would refuse if the file travels there. */
function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/^\.+/, '')
    .trim();
  return cleaned || 'Soundboard file';
}

/** Writes the file into the cache piece by piece (a backup can be big) and returns the address the share sheet needs. */
async function writeToCache(data: Blob, path: string): Promise<string> {
  try {
    for (let offset = 0; offset < Math.max(1, data.size); offset += WRITE_CHUNK) {
      const piece = toBase64(new Uint8Array(await data.slice(offset, offset + WRITE_CHUNK).arrayBuffer()));
      if (offset === 0) await Filesystem.writeFile({ path, data: piece, directory: Directory.Cache, recursive: true });
      else await Filesystem.appendFile({ path, data: piece, directory: Directory.Cache });
    }
  } catch (err) {
    // A file that stops part-way would sit there looking like a finished one.
    await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
    throw err;
  }
  return (await Filesystem.getUri({ path, directory: Directory.Cache })).uri;
}

/** Clears earlier copies before the next share instead of right after one, because nobody can say when the other app is done. */
async function removeOldShareCopies(): Promise<void> {
  try {
    const { files } = await Filesystem.readdir({ path: SHARE_FOLDER, directory: Directory.Cache });
    const cutoff = Date.now() - SHARE_COPY_KEEP_MS;
    await Promise.all(
      files
        .filter((f) => f.type === 'file' && f.mtime < cutoff)
        .map((f) => Filesystem.deleteFile({ path: `${SHARE_FOLDER}/${f.name}`, directory: Directory.Cache }).catch(() => undefined)),
    );
  } catch {
    // Nothing has been shared yet, or the folder can't be listed. Sharing still works.
  }
}

async function saveFile(file: FileToSave): Promise<SaveOutcome> {
  const title = file.title ?? file.fileName;
  try {
    await removeOldShareCopies();
    const uri = await writeToCache(file.data, `${SHARE_FOLDER}/${safeFileName(file.fileName)}`);
    try {
      await Share.share({ title, files: [uri], dialogTitle: title });
      return { status: 'shared' };
    } catch (err) {
      if (/cancel/i.test(String((err as { message?: unknown } | null)?.message ?? err))) return { status: 'cancelled' };
      throw err;
    }
  } catch {
    return { status: 'failed', message: SAVE_FAILED };
  }
}

/** Starts a small native call without waiting for it. These calls are niceties, so a failure is ignored. */
function fireAndForget(call: () => Promise<unknown>): void {
  try {
    call().catch(() => undefined);
  } catch {
    // The phone or this build of the app can't do it, and nothing is lost.
  }
}

let lastTap = -Infinity;

function haptic(strength: 'light' | 'medium' = 'light'): void {
  const now = performance.now();
  if (now - lastTap < MIN_TAP_GAP_MS) return;
  lastTap = now;
  fireAndForget(() => Haptics.impact({ style: strength === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light }));
}

/** Light icons over the dark look and dark icons over the light one. Left alone they follow the phone's own setting, which can disagree. */
function setTheme(theme: 'light' | 'dark'): void {
  fireAndForget(() => SystemBars.setStyle({ style: theme === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Dark }));
}

export const capacitorPlatform: Platform = {
  ...webPlatform,
  kind: 'capacitor',
  os: 'android',
  isNativeApp: true,
  saveFile,
  haptic,
  setTheme,
};
