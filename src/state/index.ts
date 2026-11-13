import { useStore } from 'zustand';
import { getEngine } from '../audio';
import { getStorage } from '../storage';
import { createBoardStore, type BoardState, type BoardStore } from './board';

export * from './board';
export { UNDO_WINDOW_MS, UndoStack, type UndoOffer, type UndoRequest } from './undo';

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
