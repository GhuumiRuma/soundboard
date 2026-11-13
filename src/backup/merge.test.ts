import { describe, expect, it } from 'vitest';
import { addBoard, addSound, allSounds, emptyBoards, updateSound } from '../model/boards';
import type { BoardsData } from '../model/types';
import { addBoardsFromBackup } from './merge';

/** A set of boards: each board is a name and a list of [sound name, key] pairs. */
function boardsOf(spec: [string, [string, string | null][]][], more: Partial<BoardsData> = {}): BoardsData {
  let data = emptyBoards();
  data = { ...data, boards: [] };
  for (const [boardName, sounds] of spec) {
    const created = addBoard(data, boardName);
    data = created.data;
    for (const [name, key] of sounds) {
      const added = addSound(data, created.board.id, { name, mediaId: `media-${boardName}-${name}`, originalFileName: null })!;
      data = updateSound(added.data, added.sound.id, { hotkey: key });
    }
  }
  return { ...data, ...more };
}

const keysOf = (data: BoardsData) => allSounds(data).map((s) => [s.name, s.hotkey]);

describe('addBoardsFromBackup', () => {
  it('puts the boards from the backup after the ones she has, and leaves hers alone', () => {
    const current = boardsOf([['Mine', [['Honk', 'Ctrl+1']]]]);
    const incoming = boardsOf([['Theirs', [['Bell', null]]], ['More', []]]);
    const before = structuredClone(current);
    const merged = addBoardsFromBackup(current, incoming);
    expect(merged.data.boards.map((b) => b.name)).toEqual(['Mine', 'Theirs', 'More']);
    expect(merged.data.boards[0]).toEqual(before.boards[0]);
    expect(current).toEqual(before);
  });

  it('opens the first board from the backup afterwards', () => {
    const merged = addBoardsFromBackup(boardsOf([['Mine', []]]), boardsOf([['Theirs', []], ['More', []]]));
    expect(merged.boardId).toBe(merged.data.boards[1].id);
  });

  it('keeps her volume', () => {
    const merged = addBoardsFromBackup(boardsOf([['Mine', []]], { masterVolume: 0.3 }), boardsOf([['Theirs', []]], { masterVolume: 0.9 }));
    expect(merged.data.masterVolume).toBe(0.3);
  });

  it('leaves off a key that one of her sounds already uses, and counts it', () => {
    const current = boardsOf([['Mine', [['Honk', 'Ctrl+Shift+1']]]]);
    const incoming = boardsOf([['Theirs', [['Bell', 'Ctrl+Shift+1'], ['Pop', 'Ctrl+Shift+2'], ['Quiet', null]]]]);
    const merged = addBoardsFromBackup(current, incoming);
    expect(merged.keysLeftOff).toBe(1);
    expect(keysOf(merged.data)).toEqual([
      ['Honk', 'Ctrl+Shift+1'],
      ['Bell', null],
      ['Pop', 'Ctrl+Shift+2'],
      ['Quiet', null],
    ]);
  });

  it('leaves off a key that her Stop all button uses', () => {
    const merged = addBoardsFromBackup(
      boardsOf([['Mine', []]], { stopAllKey: 'Ctrl+Shift+0' }),
      boardsOf([['Theirs', [['Bell', 'Ctrl+Shift+0']]]]),
    );
    expect(merged.keysLeftOff).toBe(1);
    expect(keysOf(merged.data)).toEqual([['Bell', null]]);
    expect(merged.data.stopAllKey).toBe('Ctrl+Shift+0');
  });

  it('counts nothing when no keys clash', () => {
    const merged = addBoardsFromBackup(boardsOf([['Mine', [['Honk', 'Ctrl+1']]]]), boardsOf([['Theirs', [['Bell', 'Ctrl+2']]]]));
    expect(merged.keysLeftOff).toBe(0);
  });

  it('does not take a key away from her when the backup has the same key twice', () => {
    const merged = addBoardsFromBackup(
      boardsOf([['Mine', []]]),
      boardsOf([['Theirs', [['A', 'Ctrl+Shift+5'], ['B', 'Ctrl+Shift+5']]]]),
    );
    expect(merged.keysLeftOff).toBe(0);
    expect(keysOf(merged.data)).toEqual([['A', 'Ctrl+Shift+5'], ['B', 'Ctrl+Shift+5']]);
  });

  it('takes the Stop all key from the backup when she has none', () => {
    const merged = addBoardsFromBackup(boardsOf([['Mine', []]]), boardsOf([['Theirs', []]], { stopAllKey: 'Ctrl+Shift+0' }));
    expect(merged.data.stopAllKey).toBe('Ctrl+Shift+0');
  });

  it('keeps her own Stop all key', () => {
    const merged = addBoardsFromBackup(
      boardsOf([['Mine', []]], { stopAllKey: 'Ctrl+Shift+9' }),
      boardsOf([['Theirs', []]], { stopAllKey: 'Ctrl+Shift+0' }),
    );
    expect(merged.data.stopAllKey).toBe('Ctrl+Shift+9');
  });

  it('does not give Stop all a key that a sound is using', () => {
    const merged = addBoardsFromBackup(
      boardsOf([['Mine', [['Honk', 'Ctrl+Shift+0']]]]),
      boardsOf([['Theirs', []]], { stopAllKey: 'Ctrl+Shift+0' }),
    );
    expect(merged.data.stopAllKey).toBeNull();
    expect(keysOf(merged.data)).toEqual([['Honk', 'Ctrl+Shift+0']]);
  });

  it('does not give Stop all a key that a sound from the backup keeps', () => {
    const merged = addBoardsFromBackup(
      boardsOf([['Mine', []]]),
      boardsOf([['Theirs', [['Bell', 'Ctrl+Shift+0']]]], { stopAllKey: 'Ctrl+Shift+0' }),
    );
    expect(merged.data.stopAllKey).toBeNull();
    expect(keysOf(merged.data)).toEqual([['Bell', 'Ctrl+Shift+0']]);
  });
});
