import { describe, expect, it } from 'vitest';
import {
  addBoard,
  addSound,
  allSounds,
  emptyBoards,
  findSound,
  moveSound,
  normalizeBoards,
  referencedMediaIds,
  removeBoard,
  removeSound,
  renameBoard,
  restoreBoard,
  restoreSound,
  setMasterVolume,
  setStopAllKey,
  soundCount,
  updateSound,
} from './boards';
import { DEFAULT_COLOR, EMOJIS, MAX_NAME_LENGTH, PALETTE } from './rules';
import type { BoardsData } from './types';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

function withSounds(count: number): BoardsData {
  let data = emptyBoards();
  const boardId = data.boards[0].id;
  for (let i = 0; i < count; i++) {
    data = addSound(data, boardId, { mediaId: `m${i}`, originalFileName: `sound-${i}.mp3` })!.data;
  }
  return data;
}

describe('emptyBoards', () => {
  it('is one empty board called "My sounds" with the volume up', () => {
    const data = emptyBoards();
    expect(data.boards).toHaveLength(1);
    expect(data.boards[0].name).toBe('My sounds');
    expect(data.boards[0].sounds).toEqual([]);
    expect(data.masterVolume).toBe(1);
    expect(data.stopAllKey).toBeNull();
  });
});

describe('boards', () => {
  it('adds a board called "New board" at the end', () => {
    const start = deepFreeze(emptyBoards());
    const { data, board } = addBoard(start);
    expect(data.boards).toHaveLength(2);
    expect(data.boards[1]).toBe(board);
    expect(board.name).toBe('New board');
    expect(board.sounds).toEqual([]);
    expect(start.boards).toHaveLength(1);
  });

  it('renames a board, and an empty name becomes "Soundboard"', () => {
    const start = deepFreeze(emptyBoards());
    const id = start.boards[0].id;
    expect(renameBoard(start, id, '  Stream alerts ').boards[0].name).toBe('Stream alerts');
    expect(renameBoard(start, id, '   ').boards[0].name).toBe('Soundboard');
    expect(renameBoard(start, id, 'x'.repeat(100)).boards[0].name.length).toBe(MAX_NAME_LENGTH);
  });

  it('always keeps at least one board', () => {
    const start = deepFreeze(emptyBoards());
    expect(removeBoard(start, start.boards[0].id)).toBeNull();
    expect(removeBoard(addBoard(start).data, 'nope')).toBeNull();
  });

  it('deletes a board and puts it back in the same place', () => {
    let data = emptyBoards();
    data = addBoard(data, 'Two').data;
    data = addBoard(data, 'Three').data;
    deepFreeze(data);
    const middle = data.boards[1];
    const result = removeBoard(data, middle.id)!;
    expect(result.data.boards.map((b) => b.name)).toEqual(['My sounds', 'Three']);
    expect(result.removed).toEqual({ board: middle, index: 1 });
    const back = restoreBoard(result.data, result.removed);
    expect(back.boards.map((b) => b.name)).toEqual(['My sounds', 'Two', 'Three']);
    expect(restoreBoard(back, result.removed)).toBe(back);
  });
});

describe('addSound', () => {
  it('names the sound after its file and starts it at 80%', () => {
    const start = deepFreeze(emptyBoards());
    const { data, sound } = addSound(start, start.boards[0].id, { mediaId: 'm1', originalFileName: 'air_horn.mp3' })!;
    expect(sound).toMatchObject({
      name: 'Air horn',
      mediaId: 'm1',
      originalFileName: 'air_horn.mp3',
      volume: 0.8,
      hotkey: null,
      emoji: EMOJIS[0],
      color: PALETTE[0],
    });
    expect(data.boards[0].sounds).toEqual([sound]);
    expect(start.boards[0].sounds).toEqual([]);
  });

  it('goes through the emoji and colours by the number of sounds on the board', () => {
    const data = withSounds(26);
    const sounds = data.boards[0].sounds;
    expect(sounds.map((s) => s.emoji)).toEqual(Array.from({ length: 26 }, (_, i) => EMOJIS[i % 24]));
    expect(sounds.map((s) => s.color)).toEqual(Array.from({ length: 26 }, (_, i) => PALETTE[i % 8]));
  });

  it('starts every board over', () => {
    let data = withSounds(3);
    data = addBoard(data).data;
    const second = data.boards[1];
    const added = addSound(data, second.id, { mediaId: 'x', originalFileName: 'x.wav' })!;
    expect(added.sound.emoji).toBe(EMOJIS[0]);
    expect(added.sound.color).toBe(PALETTE[0]);
  });

  it('uses the name it is given, tidied up', () => {
    const start = emptyBoards();
    const added = addSound(start, start.boards[0].id, { mediaId: 'm', originalFileName: null, name: '  My   recording ' })!;
    expect(added.sound.name).toBe('My recording');
    expect(added.sound.originalFileName).toBeNull();
  });

  it('does nothing for a board that is not there', () => {
    expect(addSound(emptyBoards(), 'nope', { mediaId: 'm', originalFileName: null })).toBeNull();
  });
});

describe('updateSound', () => {
  it('tidies what she changes', () => {
    const start = deepFreeze(withSounds(1));
    const id = start.boards[0].sounds[0].id;
    const next = updateSound(start, id, {
      name: 'n'.repeat(200),
      emoji: '🎉🔥✨',
      color: 'purple',
      volume: 4,
      hotkey: 'ctrl+alt+numpad 1',
    });
    const sound = next.boards[0].sounds[0];
    expect(sound.name.length).toBe(MAX_NAME_LENGTH);
    expect(sound.name.endsWith('…')).toBe(true);
    expect(sound.emoji).toBe('🎉🔥');
    expect(sound.color).toBe(DEFAULT_COLOR);
    expect(sound.volume).toBe(1);
    expect(sound.hotkey).toBe('Ctrl+Alt+Numpad1');
  });

  it('can clear a key, and an empty name becomes "Sound"', () => {
    let data = withSounds(1);
    const id = data.boards[0].sounds[0].id;
    data = updateSound(data, id, { hotkey: 'Ctrl+Alt+1' });
    expect(findSound(data, id)!.sound.hotkey).toBe('Ctrl+Alt+1');
    data = updateSound(data, id, { hotkey: null, name: '' });
    expect(findSound(data, id)!.sound.hotkey).toBeNull();
    expect(findSound(data, id)!.sound.name).toBe('Sound');
  });

  it('swaps the audio file for a new one', () => {
    const data = withSounds(1);
    const id = data.boards[0].sounds[0].id;
    const next = updateSound(data, id, { mediaId: 'new-file', originalFileName: 'new.mp3' });
    expect(next.boards[0].sounds[0]).toMatchObject({ mediaId: 'new-file', originalFileName: 'new.mp3' });
  });

  it('ignores a sound that is not there', () => {
    const data = withSounds(1);
    expect(updateSound(data, 'nope', { name: 'x' })).toBe(data);
  });
});

describe('deleting and moving sounds', () => {
  it('deletes a sound and puts it back in the same place', () => {
    const start = deepFreeze(withSounds(4));
    const target = start.boards[0].sounds[1];
    const result = removeSound(start, target.id)!;
    expect(result.data.boards[0].sounds.map((s) => s.mediaId)).toEqual(['m0', 'm2', 'm3']);
    expect(result.removed).toEqual({ sound: target, boardId: start.boards[0].id, index: 1 });
    const back = restoreSound(result.data, result.removed);
    expect(back.boards[0].sounds.map((s) => s.mediaId)).toEqual(['m0', 'm1', 'm2', 'm3']);
    expect(restoreSound(back, result.removed)).toBe(back);
  });

  it('puts a sound on the first board when its own board is gone', () => {
    let data = withSounds(2);
    data = addBoard(data).data;
    const second = data.boards[1];
    data = addSound(data, second.id, { mediaId: 'solo', originalFileName: null })!.data;
    const sound = data.boards[1].sounds[0];
    const removed = removeSound(data, sound.id)!;
    const withoutBoard = removeBoard(removed.data, second.id)!.data;
    const back = restoreSound(withoutBoard, removed.removed);
    expect(back.boards[0].sounds.map((s) => s.mediaId)).toEqual(['m0', 'm1', 'solo']);
  });

  it('moves a sound to the end of another board', () => {
    let data = withSounds(2);
    data = addBoard(data, 'Other').data;
    data = addSound(data, data.boards[1].id, { mediaId: 'o1', originalFileName: null })!.data;
    deepFreeze(data);
    const moving = data.boards[0].sounds[0];
    const next = moveSound(data, moving.id, data.boards[1].id);
    expect(next.boards[0].sounds.map((s) => s.mediaId)).toEqual(['m1']);
    expect(next.boards[1].sounds.map((s) => s.mediaId)).toEqual(['o1', 'm0']);
    expect(next.boards[1].sounds[1]).toBe(moving);
  });

  it('does nothing when the move makes no sense', () => {
    const data = addBoard(withSounds(1)).data;
    const id = data.boards[0].sounds[0].id;
    expect(moveSound(data, id, data.boards[0].id)).toBe(data);
    expect(moveSound(data, id, 'nope')).toBe(data);
    expect(moveSound(data, 'nope', data.boards[1].id)).toBe(data);
  });

  it('counts sounds and lists the audio files in use', () => {
    let data = withSounds(2);
    data = addBoard(data).data;
    data = addSound(data, data.boards[1].id, { mediaId: 'm0', originalFileName: null })!.data;
    expect(soundCount(data)).toBe(3);
    expect(allSounds(data)).toHaveLength(3);
    expect([...referencedMediaIds(data)].sort()).toEqual(['m0', 'm1']);
  });
});

describe('settings', () => {
  it('keeps the master volume between 0 and 1', () => {
    const data = emptyBoards();
    expect(setMasterVolume(data, 0.35).masterVolume).toBe(0.35);
    expect(setMasterVolume(data, 3).masterVolume).toBe(1);
    expect(setMasterVolume(data, -1).masterVolume).toBe(0);
  });

  it('saves the Stop all key in its tidy form', () => {
    const data = emptyBoards();
    expect(setStopAllKey(data, 'ctrl+alt+0').stopAllKey).toBe('Ctrl+Alt+0');
    expect(setStopAllKey(setStopAllKey(data, 'Ctrl+Alt+0'), null).stopAllKey).toBeNull();
  });
});

describe('normalizeBoards', () => {
  it('gives one empty board for anything that is not boards', () => {
    for (const raw of [undefined, null, 5, 'text', [], {}, { boards: 'nope' }, { boards: [] }, { boards: [7, null] }]) {
      const data = normalizeBoards(raw);
      expect(data.boards).toHaveLength(1);
      expect(data.boards[0].name).toBe('My sounds');
      expect(data.masterVolume).toBe(1);
      expect(data.stopAllKey).toBeNull();
    }
  });

  it('keeps good boards as they are', () => {
    const good = withSounds(3);
    const data = setStopAllKey(setMasterVolume(updateSound(good, good.boards[0].sounds[0].id, { hotkey: 'Ctrl+Alt+1' }), 0.5), 'Ctrl+Alt+0');
    expect(normalizeBoards(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it('tidies every name, emoji, colour, volume and key', () => {
    const data = normalizeBoards({
      masterVolume: 9,
      stopAllKey: 'control + alt + 0',
      boards: [
        {
          id: 'b1',
          name: '  Big\nboard  ',
          sounds: [
            {
              id: 's1',
              name: '',
              emoji: '🎉🎉🎉',
              color: 'blue',
              mediaId: ' m1 ',
              originalFileName: 'a\u0000b.mp3',
              volume: -2,
              hotkey: 'ctrl+shift+f1',
            },
            { id: 's2', name: 'Fine', emoji: '🔥', color: '#db2777', mediaId: 'm2', volume: 0.3, hotkey: 'banana' },
          ],
        },
      ],
    });
    expect(data.masterVolume).toBe(1);
    expect(data.stopAllKey).toBe('Ctrl+Alt+0');
    expect(data.boards[0]).toMatchObject({ id: 'b1', name: 'Big board' });
    expect(data.boards[0].sounds[0]).toEqual({
      id: 's1',
      name: 'Sound',
      emoji: '🎉🎉',
      color: '#7C3AED',
      mediaId: 'm1',
      originalFileName: 'a b.mp3',
      volume: 0,
      hotkey: 'Ctrl+Shift+F1',
    });
    expect(data.boards[0].sounds[1]).toMatchObject({ name: 'Fine', color: '#DB2777', volume: 0.3, hotkey: null, originalFileName: null });
  });

  it('drops a sound with no audio file', () => {
    const data = normalizeBoards({
      boards: [{ id: 'b', name: 'B', sounds: [{ id: 'a', name: 'No file' }, { id: 'c', name: 'Empty', mediaId: '  ' }, { id: 'd', name: 'Ok', mediaId: 'x' }, 'junk', null] }],
    });
    expect(data.boards[0].sounds.map((s) => s.name)).toEqual(['Ok']);
  });

  it('makes every id unique', () => {
    const data = normalizeBoards({
      boards: [
        { id: 'same', name: 'One', sounds: [{ id: 'dup', name: 'a', mediaId: 'm' }, { id: 'dup', name: 'b', mediaId: 'm' }, { name: 'c', mediaId: 'm' }] },
        { id: 'same', name: 'Two', sounds: [{ id: 'dup', name: 'd', mediaId: 'm' }] },
        { name: 'Three' },
      ],
    });
    expect(new Set(data.boards.map((b) => b.id)).size).toBe(3);
    const sounds = allSounds(data);
    expect(sounds).toHaveLength(4);
    expect(new Set(sounds.map((s) => s.id)).size).toBe(4);
    expect(data.boards[0].id).toBe('same');
    expect(sounds[0].id).toBe('dup');
  });

  it('is happy to run twice', () => {
    const once = normalizeBoards({ boards: [{ name: ' x ', sounds: [{ name: 'a  b', mediaId: 'm', color: 'bad' }] }] });
    expect(normalizeBoards(once)).toEqual(once);
  });
});
