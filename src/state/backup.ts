/**
 * Saving and restoring a backup, as the Settings pop-up uses it. The file-making and file-reading rules live in
 * src/backup; this is the part that talks to the device: it reads the stored sounds, hands the finished file to the
 * platform to be saved, puts restored sounds on the device, and tells her what happened.
 *
 * Like the board store, it is given its storage, file saver and file picker, so the tests can run it with stand-ins.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  BackupProblem,
  addBoardsFromBackup,
  addedMessage,
  backupMessages,
  leftOutMessage,
  makeBackup,
  openBackup,
  restoredMessage,
  skippedMessages,
  type OpenedBackup,
} from '../backup';
import { saveNotice } from '../lib/saveMessages';
import { soundCount } from '../model/boards';
import type { FileToSave, SaveOutcome } from '../platform/types';
import { StorageProblem, type StorageBackend } from '../storage';
import type { BoardStore } from './board';

/** What the backup part of Settings is doing right now. */
export type BackupView =
  | { phase: 'idle' }
  | { phase: 'saving' }
  | { phase: 'reading' }
  /** A backup has been read and she has sounds already, so she chooses what to do with it. */
  | { phase: 'choosing'; fileName: string; opened: OpenedBackup }
  | { phase: 'restoring' };

/** "Add" keeps what she has and adds the backup's boards. "Replace" swaps everything for the backup. */
export type RestoreMode = 'add' | 'replace';

export interface BackupDeps {
  store: BoardStore;
  storage: StorageBackend;
  /** Gives the finished file to the browser, the phone or the computer to save. */
  saveFile: (file: FileToSave) => Promise<SaveOutcome>;
  /** Opens the "pick a backup" box. It is the first thing `choose` does, so it still counts as her tap. */
  pick: () => Promise<File[]>;
  now?: () => number;
  /** Called after a backup went in, so Settings can close and the Undo bar can show on the page. */
  onRestored?: () => void;
}

export interface BackupController {
  readonly view: StoreApi<BackupView>;
  /** Makes a backup of everything and saves it. */
  save(): Promise<void>;
  /** Asks her for a backup file and reads it. Call this straight from a tap. */
  choose(): Promise<void>;
  /** Puts the backup she chose on the device. */
  restore(mode: RestoreMode): Promise<void>;
  /** Forgets the backup she was choosing about. Saving and restoring that are already under way carry on. */
  cancel(): void;
}

/** The words for a problem. Our own problems are already plain; anything else gets the fallback. */
function problemFor(error: unknown, fallback: string): string {
  if (error instanceof BackupProblem) return error.message;
  if (error instanceof StorageProblem && error.kind === 'full') return backupMessages.noRoom;
  return fallback;
}

export function createBackupController(deps: BackupDeps): BackupController {
  const { store, storage } = deps;
  const now = deps.now ?? Date.now;
  const view = createStore<BackupView>(() => ({ phase: 'idle' }));
  const phase = () => view.getState().phase;
  const show = (next: BackupView) => view.setState(next, true);

  /** Counts up whenever a choice is dropped, so a file that finishes reading after that is thrown away. */
  let attempt = 0;

  async function save(): Promise<void> {
    if (phase() !== 'idle') return;
    show({ phase: 'saving' });
    try {
      const made = await makeBackup({
        data: store.state.getState().data,
        readMedia: (mediaId) => storage.getMedia(mediaId),
        now: new Date(now()),
      });
      if (made.missing.length > 0) store.addProblem(leftOutMessage(made.missing));

      const outcome = await deps.saveFile({
        fileName: made.fileName,
        mimeType: 'application/zip',
        data: made.blob,
        title: 'Soundboard backup',
      });
      const notice = saveNotice(outcome, 'your backup');
      if (notice?.kind === 'hint') store.showNotice(notice.text);
      else if (notice) store.addProblem(notice.text);

      // Closing the save box, or a save that failed, is not a backup. Only a file that went somewhere counts.
      if (outcome.status === 'saved' || outcome.status === 'shared') {
        store.updateSettings({ lastBackupAt: now(), remindAfter: null });
      }
    } catch (error) {
      store.addProblem(problemFor(error, backupMessages.couldNotSave));
    } finally {
      show({ phase: 'idle' });
    }
  }

  async function apply(opened: OpenedBackup, mode: RestoreMode): Promise<void> {
    show({ phase: 'restoring' });
    // Until the boards point at the new files, a clean-up must not throw them away.
    const releases = opened.media.map((media) => store.reserveMedia(media.id));
    let restored = false;
    try {
      await storage.putMedia(opened.media);
      if (mode === 'replace') {
        store.replaceBoards(opened.data, restoredMessage(opened.boards, opened.sounds));
      } else {
        // Added to what she has right now, which may not be what she had when she picked the file.
        const merged = addBoardsFromBackup(store.state.getState().data, opened.data);
        store.replaceBoards(merged.data, addedMessage(opened.boards, opened.sounds, merged.keysLeftOff), merged.boardId);
      }
      restored = true;
    } catch (error) {
      store.addProblem(problemFor(error, backupMessages.restoreFailed));
    } finally {
      for (const release of releases) release();
      show({ phase: 'idle' });
    }

    if (!restored) {
      void store.sweep();
      return;
    }
    for (const line of skippedMessages(opened.skipped)) store.addProblem(line);
    deps.onRestored?.();
  }

  async function choose(): Promise<void> {
    if (phase() !== 'idle') return;
    // Nothing may be awaited before this, or the browser decides she didn't ask for the box.
    const files = await deps.pick();
    const file = files[0];
    if (!file || phase() !== 'idle') return;

    const mine = ++attempt;
    show({ phase: 'reading' });
    try {
      const opened = await openBackup(file);
      if (mine !== attempt) return;
      if (soundCount(store.state.getState().data) === 0) {
        // She has nothing to lose, so there is nothing to ask.
        await apply(opened, 'replace');
      } else {
        show({ phase: 'choosing', fileName: file.name, opened });
      }
    } catch (error) {
      if (mine !== attempt) return;
      store.addProblem(problemFor(error, backupMessages.damaged));
      show({ phase: 'idle' });
    }
  }

  async function restore(mode: RestoreMode): Promise<void> {
    const current = view.getState();
    if (current.phase !== 'choosing') return;
    await apply(current.opened, mode);
  }

  function cancel(): void {
    const current = phase();
    if (current === 'choosing' || current === 'reading') {
      attempt += 1;
      show({ phase: 'idle' });
    }
  }

  return { view, save, choose, restore, cancel };
}
