import type { DeviceOs } from '../lib/device';

/** What Settings tells her about putting Soundboard on this device. */
export type InstallHelp = 'installed' | 'button' | 'ios' | 'ios-browser' | 'android' | 'computer';

export interface InstallFacts {
  os: DeviceOs;
  /** Safari, rather than another browser on an iPhone or iPad. */
  iosSafari: boolean;
  /** Opened from the Home Screen or the installed app's icon instead of a browser tab. */
  standalone: boolean;
  /** Inside the Android or desktop app, which needs no installing. */
  nativeApp: boolean;
  /** The browser has offered a one-tap install. Chrome, Edge and most Android browsers do; Safari doesn't. */
  canPrompt: boolean;
  /** She installed it a moment ago, during this visit. */
  installed: boolean;
  /** She said "Got it" or "No thanks" to the note on the main screen. */
  dismissed: boolean;
}

export interface InstallAdvice {
  /** What Settings says, or null where there is nothing to install. */
  help: InstallHelp | null;
  /** Whether the note on the main screen shows. */
  note: boolean;
}

/**
 * Decides what to say about installing. The note on the main screen only shows where installing is easy to miss and
 * worth doing: when the browser can install Soundboard with one tap, and on iPhone and iPad, where it takes the
 * Share button. Settings always has the steps for this device.
 */
export function installAdvice(facts: InstallFacts): InstallAdvice {
  if (facts.nativeApp) return { help: null, note: false };
  if (facts.standalone || facts.installed) return { help: 'installed', note: false };

  let help: InstallHelp;
  if (facts.canPrompt) help = 'button';
  else if (facts.os === 'ios') help = facts.iosSafari ? 'ios' : 'ios-browser';
  else if (facts.os === 'android') help = 'android';
  else help = 'computer';

  const wantsNote = facts.canPrompt || facts.os === 'ios';
  return { help, note: wantsNote && !facts.dismissed };
}
