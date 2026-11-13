import type { InstallHelp } from './advice';

/** The bar that shows when a newer version of Soundboard has been downloaded and is waiting. */
export const updateMessages = {
  ready: 'A new version of Soundboard is ready.',
  stays: 'Your boards and sounds will still be here.',
  update: 'Update now',
  updating: 'Updating…',
  later: 'Later',
  stuck: "I couldn't update just now. Close Soundboard, then open it again to get the new version.",
} as const;

const SHARE_STEPS =
  'Tap the Share button (a square with an arrow pointing up), scroll down and tap Add to Home Screen, then tap Add.';
const OPEN_IN_SAFARI = "If you don't see Add to Home Screen, open this page in Safari and try again.";
const WHY_HOME_SCREEN =
  "Safari can clear what a website has saved if you haven't visited it for a while. An app on your Home Screen is safe from that.";
const KEEP_SOUNDS =
  'Sounds you added in Safari stay in Safari. To bring them over, tap Save a backup here, then open Soundboard from your Home Screen and tap Restore from a backup in Settings.';

export const installMessages = {
  heading: 'Install on this device',
  installed: 'Soundboard is installed on this device.',
  /** One tap installs it (Chrome, Edge and most Android browsers). */
  offer: 'Install Soundboard to open it like an app, even without internet.',
  install: 'Install',
  installSoundboard: 'Install Soundboard',
  noThanks: 'No thanks',
  gotIt: 'Got it',
  /** For Windows and Mac in a browser, where sound keys only work while the Soundboard window is in front. */
  desktopApp: 'Want your sound keys to work while a game is in front? The Windows and Mac apps do that.',
  desktopAppLink: 'Get the Windows or Mac app',
} as const;

/** The steps Settings shows where the browser can't install Soundboard with one tap. */
export const installSteps: Record<'ios' | 'ios-browser' | 'android' | 'computer', readonly string[]> = {
  ios: [SHARE_STEPS, WHY_HOME_SCREEN, KEEP_SOUNDS],
  'ios-browser': [SHARE_STEPS, OPEN_IN_SAFARI, WHY_HOME_SCREEN, KEEP_SOUNDS],
  android: ["Open your browser's menu (the three dots), then tap Install app or Add to Home screen."],
  computer: [
    'In Chrome or Edge, click the install icon at the right end of the address bar, or open the menu and choose Install Soundboard.',
    'In Safari on a Mac, choose File, then Add to Dock.',
  ],
};

const NOTE_IOS =
  'Add Soundboard to your Home Screen to use it like an app. Tap the Share button (a square with an arrow pointing up), then Add to Home Screen.';
const NOTE_KEEP_SOUNDS =
  "Your sounds won't move over by themselves. Open Settings, tap Save a backup, then use Restore from a backup in the Home Screen app.";

/** The note on the main screen, one paragraph per entry. The second paragraph is smaller print. */
export function installNote(help: InstallHelp, hasSounds: boolean): readonly string[] {
  switch (help) {
    case 'button':
      return [installMessages.offer];
    case 'ios':
      return hasSounds ? [NOTE_IOS, NOTE_KEEP_SOUNDS] : [NOTE_IOS];
    case 'ios-browser': {
      const first = `${NOTE_IOS} If you don't see it, open this page in Safari.`;
      return hasSounds ? [first, NOTE_KEEP_SOUNDS] : [first];
    }
    default:
      return [];
  }
}
