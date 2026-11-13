import { webPlatform } from './web';
import type { Platform } from './types';

/**
 * The Windows and Mac installers (Tauri).
 *
 * TODO (desktop build): replace these with the real thing.
 *   - saveFile: the Tauri save box (plugin-dialog) + plugin-fs, so a backup or recording goes where she picks.
 *   - soundKeys: plugin-global-shortcut, so sound keys work while a game or another app is in front.
 *     Set `global: true`. `toGlobalShortcut()` in src/keys/keyString.ts turns a saved key ("Ctrl+Alt+1") into the
 *     text the plugin reads. Report keys another program already holds through `unavailable`.
 *   - init: anything the window needs before the first screen.
 */
export const tauriPlatform: Platform = {
  ...webPlatform,
  kind: 'tauri',
  isNativeApp: true,
};
