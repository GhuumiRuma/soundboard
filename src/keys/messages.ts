import type { BoardsData } from '../model/types';
import type { DeviceOs } from '../lib/device';
import { brokenKeyNote, keyOwners, planKeys, type KeyOwner, type KeyOwnerRef, type KeyPlace } from './clashes';
import { formatKey, keyWarning, modifierLabel, normalizeKeyString, safeKeyAdvice } from './keyString';
import type { SoundKeyStatus } from './service';

/** One line of help under a key box. `tone` says how it should look: plain, a warning, or a problem. */
export interface HotkeyNote {
  text: string;
  tone: 'ok' | 'warn' | 'problem';
}

/** What to say when she presses something that can't be a sound key (Enter, Escape, a symbol the keyboard has no code for). */
export function unsupportedKeyText(os?: DeviceOs): string {
  return `That key can't be used as a sound key. Try a letter, a number or an F key, held with ${modifierLabel('Ctrl', os)} or ${modifierLabel('Alt', os)}.`;
}

/** The suggestion shown while a sound has no key yet. */
export function soundKeyTip(where: KeyPlace): string {
  const tip = `Tip: ${safeKeyAdvice(where.os)} (like ${formatKey('Ctrl+Alt+1', where.os)}) makes a good sound key.`;
  return where.global ? `${tip} Games rarely use those.` : tip;
}

/**
 * The note under a key box when she isn't picking a key: a tip for a sound that has none, why a saved key does nothing,
 * or a warning for a key that is easy to press by mistake. Null when there is nothing to say.
 */
export function keyNote(data: BoardsData, owner: KeyOwnerRef, key: string | null, where: KeyPlace): HotkeyNote | null {
  const normalized = normalizeKeyString(key);
  if (!normalized) return owner.kind === 'sound' ? { text: soundKeyTip(where), tone: 'ok' } : null;
  const broken = brokenKeyNote(planKeys(data, where), owner);
  if (broken) return { text: broken, tone: 'problem' };
  const warning = keyWarning(normalized, where);
  return warning ? { text: warning, tone: 'warn' } : null;
}

/** The one line under "Sound keys" that says whether they are on and where they work. */
export function soundKeysStatusLine(args: { enabled: boolean; global: boolean; data: BoardsData }): string {
  if (!args.enabled) return 'Sound keys are off.';
  if (keyOwners(args.data).length > 0) {
    return args.global
      ? 'Your sound keys work even while a game or another app is in front.'
      : 'Your sound keys work while this window is in front.';
  }
  const anySounds = args.data.boards.some((board) => board.sounds.length > 0);
  return anySounds ? 'None of your sounds has a key yet. Pick one with ✏️ Edit.' : 'Add a sound first, then pick a key for it with ✏️ Edit.';
}

export interface SoundKeyNotice {
  title: string;
  text: string;
}

/** What to tell her when a sound key can't be used, or null when all is well. */
export function soundKeyNotice(status: SoundKeyStatus, data: BoardsData, where: KeyPlace): SoundKeyNotice | null {
  if (status.failed) {
    return { title: "Sound keys aren't working", text: "Sound keys couldn't be turned on. You can still tap the buttons." };
  }
  const active = planKeys(data, where).active;
  const lost: KeyOwner[] = [];
  for (const key of status.unavailable) {
    const owner = active.find((o) => o.key === key);
    if (owner) lost.push(owner);
  }
  if (lost.length === 0) return null;
  if (lost.length === 1) {
    const [owner] = lost;
    return {
      title: "A sound key isn't working",
      text: `${formatKey(owner.key, where.os)} for “${owner.name}”: another app is probably using it. You can pick another key with ✏️ Edit.`,
    };
  }
  const names = lost.map((o) => `“${o.name}”`).join(', ');
  return {
    title: "Some sound keys aren't working",
    text: `${lost.length} sound keys can't be used, most likely because another app uses them: ${names}. You can pick other keys with ✏️ Edit.`,
  };
}
