import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { register, unregister, unregisterAll, type ShortcutEvent } from '@tauri-apps/plugin-global-shortcut';
import { toGlobalShortcut } from '../keys/keyString';
import { webPlatform } from './web';
import type { FileToSave, Platform, SaveOutcome, SoundKeyBinding, SoundKeyHost } from './types';

/**
 * The Windows and Mac installers (Tauri).
 *
 * - saveFile opens the computer's own save box, so a backup or a recording goes where she picks.
 * - Sound keys are global: they play while a game or another app is in front, for as long as Soundboard is open
 *   (closing its window ends them, minimising it doesn't).
 * - haptic stays the web one, because a computer has nothing to tap with.
 * - There is no setTheme: the window follows the computer's own light or dark setting, and so does the "System" look.
 *
 * This file is only loaded inside the installers (see index.ts), so the plugins are imported straight away.
 * The permissions these calls need are listed in src-tauri/capabilities/default.json.
 */

const SAVE_FAILED = "I couldn't save that file. Please try again.";

/** Keeps the name free of characters a computer would refuse, so the save box always starts with a usable name. */
function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/^\.+/, '')
    .trim();
  return cleaned || 'Soundboard file';
}

/** Tells the save box what kind of file this is, so it keeps the ending (like .zip) on the name she types. */
function filtersFor(fileName: string): { name: string; extensions: string[] }[] | undefined {
  const extension = /\.([A-Za-z0-9]{1,10})$/.exec(fileName)?.[1];
  return extension ? [{ name: `${extension.toUpperCase()} file`, extensions: [extension.toLowerCase()] }] : undefined;
}

/** The folders every Windows and Mac account has, straight inside her own folder (or inside OneDrive on Windows). */
const PERSONAL_FOLDER =
  /^(?:[A-Za-z]:)?[\\/](?:Users|home)[\\/][^\\/]+(?:[\\/]OneDrive[^\\/]*)?[\\/](Desktop|Documents|Downloads|Music|Pictures|Videos|Movies)[\\/][^\\/]+$/i;

/** Where a saved file went, in words she can use ("your Downloads folder"), or nothing when the path says too little. */
export function describeFolder(path: string): string | undefined {
  const personal = PERSONAL_FOLDER.exec(path);
  if (personal) return `your ${personal[1].charAt(0).toUpperCase()}${personal[1].slice(1).toLowerCase()} folder`;
  const folders = path.split(/[\\/]+/).filter((part) => part !== '');
  folders.pop();
  const folder = folders.at(-1);
  if (!folder) return undefined;
  return /^[A-Za-z]:$/.test(folder) ? `the ${folder.toUpperCase()} drive` : `the "${folder}" folder`;
}

async function saveFile(file: FileToSave): Promise<SaveOutcome> {
  try {
    const fileName = safeFileName(file.fileName);
    const path = await save({ title: file.title ?? fileName, defaultPath: fileName, filters: filtersFor(fileName) });
    if (path === null) return { status: 'cancelled' };
    // The save box has just added this one path to what the app may write to, so nothing else is reachable.
    await writeFile(path, new Uint8Array(await file.data.arrayBuffer()));
    return { status: 'saved', where: describeFolder(path) };
  } catch {
    return { status: 'failed', message: SAVE_FAILED };
  }
}

/** Runs a plugin call and says whether it worked. One key the computer refuses must not stop the others. */
async function attempt(call: () => Promise<unknown>): Promise<boolean> {
  try {
    await call();
    return true;
  } catch {
    return false;
  }
}

interface WantedKey {
  run: () => void;
  /** Every way the app wrote this key, so each can be reported if the computer refuses it. */
  spellings: string[];
}

/** Sound keys on a computer: the system hands over a key press even while a game or another app is in front. */
class GlobalSoundKeys implements SoundKeyHost {
  readonly global = true;
  /** The keys the computer holds for Soundboard, by the text the plugin was given. */
  private held = new Set<string>();
  /** What each key plays right now. A key with nothing here does nothing when pressed. */
  private plays = new Map<string, () => void>();
  /** Calls to setKeys wait for each other, so a quick run of changes can't tangle. */
  private queue: Promise<unknown> = Promise.resolve();
  private cleared: Promise<void> | null = null;

  /**
   * Lets go of every key the computer still holds for an earlier copy of the page. Reloading the page forgets its
   * keys but the computer doesn't, so they would stay out of reach of other apps. Done once, before any key is set.
   */
  reset(): Promise<void> {
    this.cleared ??= attempt(() => unregisterAll()).then(() => undefined);
    return this.cleared;
  }

  setKeys(bindings: readonly SoundKeyBinding[]): Promise<{ unavailable: string[] }> {
    const result = this.queue.then(() => this.apply(bindings));
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async apply(bindings: readonly SoundKeyBinding[]): Promise<{ unavailable: string[] }> {
    await this.reset();

    const unavailable: string[] = [];
    const wanted = new Map<string, WantedKey>();
    for (const { key, run } of bindings) {
      if (key.trim() === '') continue;
      const shortcut = toGlobalShortcut(key);
      if (!shortcut) {
        unavailable.push(key);
        continue;
      }
      const same = wanted.get(shortcut);
      // Two sounds on one key: the first one plays, as it does in a browser.
      if (same) same.spellings.push(key);
      else wanted.set(shortcut, { run, spellings: [key] });
    }

    for (const shortcut of [...this.held]) {
      if (wanted.has(shortcut)) continue;
      // Quiet from now on, even if the computer is slow to let go of the key.
      this.plays.delete(shortcut);
      if (await attempt(() => unregister(shortcut))) this.held.delete(shortcut);
    }

    for (const [shortcut, { run, spellings }] of wanted) {
      this.plays.set(shortcut, run);
      if (this.held.has(shortcut)) continue;
      if (await attempt(() => register(shortcut, (event) => this.pressed(shortcut, event)))) {
        this.held.add(shortcut);
      } else {
        this.plays.delete(shortcut);
        unavailable.push(...spellings);
      }
    }

    return { unavailable: [...new Set(unavailable)] };
  }

  /** A key sends "Pressed" and then "Released". Only the press plays the sound. */
  private pressed(shortcut: string, event: ShortcutEvent): void {
    if (event.state === 'Pressed') this.plays.get(shortcut)?.();
  }
}

const soundKeys = new GlobalSoundKeys();

/**
 * A minimised page can be put to sleep after a few minutes, which would hold every key press back until the window
 * is opened again. A page that holds a lock is left awake. Where there are no locks, the window's own setting
 * (backgroundThrottling in tauri.conf.json) does the same job.
 */
function keepPageAwake(): void {
  try {
    void navigator.locks?.request('soundboard-keep-awake', () => new Promise<never>(() => undefined)).catch(() => undefined);
  } catch {
    // Nothing is lost: the keys still work while the window is in view.
  }
}

async function init(): Promise<void> {
  keepPageAwake();
  // Not waited for: a slow answer must never hold up the first screen. The first setKeys waits for it instead.
  void soundKeys.reset();
}

export const tauriPlatform: Platform = {
  ...webPlatform,
  kind: 'tauri',
  isNativeApp: true,
  init,
  saveFile,
  soundKeys,
};
