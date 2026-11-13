import { describe, expect, it } from 'vitest';
import { addBoard, addSound, emptyBoards, removeSound } from '../model/boards';
import type { BoardsData } from '../model/types';
import { bytesOf } from '../test/audio';
import { countMediaReferences, sweepUnusedMedia, unusedMediaIds } from './media';
import { MemoryStorage } from './memory';

function boardsUsing(...mediaIds: string[]): BoardsData {
  let data = emptyBoards();
  const boardId = data.boards[0].id;
  for (const mediaId of mediaIds) data = addSound(data, boardId, { mediaId, originalFileName: `${mediaId}.wav` })!.data;
  return data;
}

describe('countMediaReferences', () => {
  it('counts how many sounds use each audio file', () => {
    expect(Object.fromEntries(countMediaReferences(boardsUsing('a', 'b', 'a')))).toEqual({ a: 2, b: 1 });
  });

  it('counts sounds on every board', () => {
    let data = boardsUsing('a');
    const second = addBoard(data, 'Second');
    data = addSound(second.data, second.board.id, { mediaId: 'a', originalFileName: null })!.data;
    expect(countMediaReferences(data).get('a')).toBe(2);
  });

  it('is empty when there are no sounds', () => {
    expect(countMediaReferences(emptyBoards()).size).toBe(0);
  });
});

describe('unusedMediaIds', () => {
  it('lists the files no sound uses', () => {
    expect(unusedMediaIds(['a', 'b', 'c'], boardsUsing('a'))).toEqual(['b', 'c']);
  });

  it('keeps a file while another sound still uses it', () => {
    const data = boardsUsing('shared', 'shared');
    const afterDelete = removeSound(data, data.boards[0].sounds[0].id)!.data;
    expect(unusedMediaIds(['shared'], afterDelete)).toEqual([]);
  });

  it('keeps the file of a sound she just deleted, so Undo can bring it back', () => {
    const data = boardsUsing('a', 'b');
    const afterDelete = removeSound(data, data.boards[0].sounds[1].id)!.data;
    expect(unusedMediaIds(['a', 'b'], afterDelete, ['b'])).toEqual([]);
    expect(unusedMediaIds(['a', 'b'], afterDelete, [])).toEqual(['b']);
  });
});

describe('sweepUnusedMedia', () => {
  async function storageWith(ids: string[]) {
    const storage = new MemoryStorage();
    await storage.putMedia(ids.map((id) => ({ id, data: bytesOf(1, 2, 3), ext: 'wav' as const, mime: 'audio/wav' })));
    return storage;
  }

  it('throws away unused files and nothing else', async () => {
    const storage = await storageWith(['used', 'leftover', 'held']);
    const removed = await sweepUnusedMedia(storage, boardsUsing('used'), ['held']);
    expect(removed).toEqual(['leftover']);
    expect((await storage.mediaIds()).sort()).toEqual(['held', 'used']);
  });

  it('lets go of a held file once the Undo time has passed', async () => {
    const storage = await storageWith(['used', 'held']);
    await sweepUnusedMedia(storage, boardsUsing('used'), ['held']);
    expect(await storage.hasMedia('held')).toBe(true);
    await sweepUnusedMedia(storage, boardsUsing('used'), []);
    expect(await storage.hasMedia('held')).toBe(false);
    expect(await storage.hasMedia('used')).toBe(true);
  });

  it('never deletes a file a sound is using, even with no holds', async () => {
    const storage = await storageWith(['a', 'b']);
    expect(await sweepUnusedMedia(storage, boardsUsing('a', 'b'))).toEqual([]);
    expect((await storage.mediaIds()).sort()).toEqual(['a', 'b']);
  });

  it('cleans up after a sound that was never saved (the app was closed half way)', async () => {
    const storage = await storageWith(['orphan']);
    await sweepUnusedMedia(storage, emptyBoards());
    expect(await storage.mediaIds()).toEqual([]);
  });
});
