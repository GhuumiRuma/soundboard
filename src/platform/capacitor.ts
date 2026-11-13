import { webPlatform } from './web';
import type { Platform } from './types';

/**
 * The Android app (Capacitor).
 *
 * TODO (Android build): replace these with the real thing.
 *   - saveFile: Capacitor Filesystem + Share, so a backup or recording can go to Files, Drive, WhatsApp and so on.
 *   - haptic: @capacitor/haptics.
 *   - init: anything the Android app needs before the first screen (status bar colour, etc.).
 * Sound keys stay on the window key events (a phone has no global keys), so `soundKeys` can be left as it is.
 */
export const capacitorPlatform: Platform = {
  ...webPlatform,
  kind: 'capacitor',
  isNativeApp: true,
};
