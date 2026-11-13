import { keyOwners } from '../keys/clashes';
import type { BoardsData } from '../model/types';

export interface MergedBoards {
  data: BoardsData;
  /** The first board that came from the backup. It is the one to open afterwards. */
  boardId: string;
  /** How many sound keys from the backup were left off because something she already has uses them. */
  keysLeftOff: number;
}

/**
 * Adds the boards from a backup after the ones she already has, and changes nothing she already has.
 * Her volume stays as it is. A sound key from the backup that one of her sounds (or Stop all) already uses is left off,
 * so a key is never taken away from what she has. Her Stop all key is only filled in when she hasn't got one.
 */
export function addBoardsFromBackup(current: BoardsData, incoming: BoardsData): MergedBoards {
  const taken = new Set(keyOwners(current).map((owner) => owner.key));
  let keysLeftOff = 0;
  const boards = incoming.boards.map((board) => ({
    ...board,
    sounds: board.sounds.map((sound) => {
      if (!sound.hotkey || !taken.has(sound.hotkey)) return sound;
      keysLeftOff += 1;
      return { ...sound, hotkey: null };
    }),
  }));

  const merged: BoardsData = { ...current, boards: [...current.boards, ...boards] };
  const stopKey = incoming.stopAllKey;
  const soundUsesIt = stopKey !== null && keyOwners(merged).some((owner) => owner.kind === 'sound' && owner.key === stopKey);
  const stopAllKey = current.stopAllKey ?? (soundUsesIt ? null : stopKey);

  return { data: { ...merged, stopAllKey }, boardId: boards[0]?.id ?? current.boards[0].id, keysLeftOff };
}
