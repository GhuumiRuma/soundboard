import { useSyncExternalStore } from 'react';
import { getEngine } from '../audio';
import { restoreFocusAfterEditor } from '../lib/focus';
import { pickSoundFiles } from '../lib/pickFiles';
import { getPlatform } from '../platform';
import { flashSound } from './flash';
import { getBoardStore } from './index';

/** Closes the edit card (or sheet) and puts the keyboard cursor back where she was. */
export function closeEditor(soundId: string): void {
  getBoardStore().editSound(null);
  restoreFocusAfterEditor(soundId);
}

/** Deletes the sound she is editing. The Undo bar can bring it back. */
export function deleteSoundFromEditor(soundId: string): void {
  getBoardStore().deleteSound(soundId);
  restoreFocusAfterEditor(soundId);
}

/** Opens the "pick a file" box and adds whatever she chooses to the board that is open. Call it straight from a tap. */
export async function browseForSounds(): Promise<void> {
  const files = await pickSoundFiles({ multiple: true });
  if (files.length > 0) await getBoardStore().addSounds(files);
}

/** Opens the "pick a file" box and puts the chosen file in place of this sound's file. */
export async function browseForReplacement(soundId: string): Promise<void> {
  const [file] = await pickSoundFiles({ multiple: false });
  if (file) await getBoardStore().replaceSound(soundId, file);
}

/** Plays a sound from a tap or a key. A tap also gives a tiny buzz on phones. */
export function playSound(soundId: string, options: { haptic?: boolean } = {}): void {
  flashSound(soundId);
  if (options.haptic) getPlatform().haptic('light');
  void getBoardStore().play(soundId);
}

export function stopAllSounds(): void {
  getBoardStore().stopAll();
}

/** True while this sound is making noise (it can be playing more than once at the same time). */
export function useSoundPlaying(soundId: string): boolean {
  const engine = getEngine();
  return useSyncExternalStore(engine.subscribe, () => engine.getState().playing.has(soundId));
}

/** True while a big sound is still being got ready after the first tap. */
export function useSoundLoading(soundId: string): boolean {
  const engine = getEngine();
  return useSyncExternalStore(engine.subscribe, () => engine.getState().loading.has(soundId));
}

/** True while anything at all is playing. */
export function useAnythingPlaying(): boolean {
  const engine = getEngine();
  return useSyncExternalStore(engine.subscribe, () => engine.getState().playing.size > 0);
}
