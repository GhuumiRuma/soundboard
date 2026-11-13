import { useStore } from 'zustand';
import { getEngine } from '../audio';
import { BACKUP_TYPES, pickFiles } from '../lib/pickFiles';
import { getPlatform } from '../platform';
import { getStorage } from '../storage';
import { createBackupController, type BackupController, type BackupView } from './backup';
import { createBoardStore, type BoardState, type BoardStore } from './board';
import { ui } from './ui';

export * from './board';
export { UNDO_WINDOW_MS, UndoStack, type UndoOffer, type UndoRequest } from './undo';
export type { BackupController, BackupView, RestoreMode } from './backup';

let store: BoardStore | undefined;

/** The one place her boards live while the app is open. Open the storage before the first call. */
export function getBoardStore(): BoardStore {
  store ??= createBoardStore({ storage: getStorage(), engine: getEngine() });
  return store;
}

/** Reads a piece of the board state and redraws when that piece changes. */
export function useBoard<T>(selector: (state: BoardState) => T): T {
  return useStore(getBoardStore().state, selector);
}

let backup: BackupController | undefined;

/** Saves and restores backups. Settings closes when a backup has been put on the device, so the Undo bar shows on the page. */
export function getBackupController(): BackupController {
  backup ??= createBackupController({
    store: getBoardStore(),
    storage: getStorage(),
    saveFile: (file) => getPlatform().saveFile(file),
    pick: () => pickFiles({ accept: BACKUP_TYPES, multiple: false }),
    onRestored: ui.closeSettings,
  });
  return backup;
}

/** What the backup part of Settings is doing, and redraws when that changes. */
export function useBackupView(): BackupView {
  return useStore(getBackupController().view);
}
