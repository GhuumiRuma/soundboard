import type { DeviceOs } from '../lib/device';

/** Where the app is running. "web" is every browser and the installed web app, on every device. */
export type PlatformKind = 'web' | 'capacitor' | 'tauri';

export interface FileToSave {
  /** The name shown in the save box or share sheet, like "Soundboard backup 2026-11-12.zip". */
  fileName: string;
  mimeType: string;
  data: Blob;
  /** Short wording for save boxes, like "Save your backup". */
  title?: string;
}

export type SaveOutcome =
  /** The file was written. `where` says where, in words she can use ("your Downloads folder"). */
  | { status: 'saved'; where?: string }
  /** The share sheet was shown. (The browser can't say what she picked, only that it opened.) */
  | { status: 'shared' }
  /** She closed the save box or share sheet. Nothing was saved. */
  | { status: 'cancelled' }
  /** Something went wrong. `message` is plain wording that can be shown as it is. */
  | { status: 'failed'; message: string };

export interface SoundKeyBinding {
  /** A saved key like "Ctrl+Alt+1". See src/keys/keyString.ts. */
  key: string;
  /** Called each time the key is pressed. */
  run: () => void;
}

export interface SoundKeyHost {
  /** True when the keys work while another app is in front (the Windows and Mac installers). */
  readonly global: boolean;
  /**
   * Listen for exactly these keys and no others (this replaces any keys set before; pass [] to stop listening).
   * Resolves with the keys that could not be taken, for example because another program already uses them.
   */
  setKeys(bindings: readonly SoundKeyBinding[]): Promise<{ unavailable: string[] }>;
}

export interface Platform {
  readonly kind: PlatformKind;
  readonly os: DeviceOs;
  /** True in the Android app and the Windows and Mac installers. False in a browser or the installed web app. */
  readonly isNativeApp: boolean;
  /** Runs once at start-up, before the first screen is drawn. */
  init?(): Promise<void>;
  /** Lets her keep a file: a download in a browser, the share sheet on a phone, a save box on a computer. */
  saveFile(file: FileToSave): Promise<SaveOutcome>;
  readonly soundKeys: SoundKeyHost;
  /** A light tap on phones. Does nothing where there is nothing to tap with. */
  haptic(strength?: 'light' | 'medium'): void;
  /** Called when the light or dark look changes, so a native app can restyle its own bars. */
  setTheme?(theme: 'light' | 'dark'): void;
}
