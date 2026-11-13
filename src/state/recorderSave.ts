import { addedText } from '../audio/recorder/messages';
import type { RecordedFile, SaveResult } from '../audio/recorder/session';
import { currentBoard, type BoardStore } from './board';
import type { RecorderTarget } from './ui';

/**
 * Turns a finished recording into a sound: a new button on the board that is open, or a new file for a sound she
 * already has (its name, colour, volume and key stay). The recording is an ordinary WAV, so it is stored and played
 * like any sound she added herself. When it can't be kept, the reason is the store's own plain message.
 */
export async function saveRecording(store: BoardStore, target: RecorderTarget, file: RecordedFile): Promise<SaveResult> {
  const bytes = { bytes: file.bytes, ext: 'wav', mime: 'audio/wav', fileName: file.fileName } as const;

  if (target.kind === 'replace') {
    // The Undo bar already says "Replaced the file for …", so nothing more is needed here.
    return store.replaceSoundBytes(target.soundId, bytes);
  }

  const added = await store.addSoundBytes({ ...bytes, name: file.name });
  if (!added.ok) return added;
  store.showNotice(addedText(added.sound.name, currentBoard(store.state.getState()).name));
  return { ok: true };
}
