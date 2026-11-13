import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundProblem, soundMessages, type PlayResult } from '../audio/engine';
import { EMOJIS, PALETTE } from '../model/rules';
import { MemoryStorage } from '../storage/memory';
import { StorageProblem, importMessages, storageMessages } from '../storage';
import { makeWav } from '../test/audio';
import { fakeEngine } from '../test/engine';
import { boardMessages, createBoardStore, currentBoard, editingSound } from './board';
import { UNDO_WINDOW_MS } from './undo';

async function setup(storage = new MemoryStorage(true), engine = fakeEngine()) {
  const store = createBoardStore({ storage, engine });
  await store.load();
  return { store, storage, engine, state: store.state.getState };
}

const wavFile = (name = 'Airhorn.wav') => new File([makeWav()], name, { type: 'audio/wav' });

async function soundOn(store: Awaited<ReturnType<typeof setup>>['store'], name = 'Airhorn.wav') {
  await store.addSounds([wavFile(name)]);
  const board = currentBoard(store.state.getState());
  return board.sounds[board.sounds.length - 1];
}

describe('loading', () => {
  it('starts with one empty board called My sounds', async () => {
    const { state, engine } = await setup();
    expect(state().loaded).toBe(true);
    expect(state().data.boards).toHaveLength(1);
    expect(state().data.boards[0]).toMatchObject({ name: 'My sounds', sounds: [] });
    expect(state().boardId).toBe(state().data.boards[0].id);
    expect(state().persistent).toBe(true);
    expect(engine.setMasterVolume).toHaveBeenCalledWith(1);
  });

  it('says when this browser will not keep her sounds', async () => {
    const { state } = await setup(new MemoryStorage(false));
    expect(state().persistent).toBe(false);
  });

  it('brings back her saved boards and settings, and gets her sounds ready', async () => {
    const first = await setup();
    const sound = await soundOn(first.store);
    first.store.setMasterVolume(0.4);
    first.store.updateSettings({ soundKeysEnabled: false });
    await first.store.flush();

    const engine = fakeEngine();
    const again = await setup(first.storage, engine);
    expect(currentBoard(again.state()).sounds.map((s) => s.id)).toEqual([sound.id]);
    expect(again.state().data.masterVolume).toBe(0.4);
    expect(again.state().settings.soundKeysEnabled).toBe(false);
    expect(engine.setMasterVolume).toHaveBeenCalledWith(0.4);
    expect(engine.preload).toHaveBeenCalledWith([sound.mediaId]);
  });

  it('throws away audio files that no sound uses when it starts', async () => {
    const storage = new MemoryStorage(true);
    const [orphan] = await storage.putMedia([{ data: makeWav(), ext: 'wav', mime: 'audio/wav' }]);
    const { store } = await setup(storage);
    await store.sweep();
    expect(await storage.hasMedia(orphan)).toBe(false);
  });

  it('writes nothing over her saved sounds when they could not be read', async () => {
    const storage = new MemoryStorage(true);
    storage.loadBoards = async () => {
      throw new Error('unreadable');
    };
    const save = vi.spyOn(storage, 'saveBoards');
    const { store, state } = await setup(storage);
    expect(state().problems).toEqual([boardMessages.couldNotRead]);
    store.addBoard();
    await store.flush();
    expect(save).not.toHaveBeenCalled();
    expect(state().data.boards).toHaveLength(2);
  });
});

describe('boards', () => {
  it('adds a board called New board and opens it', async () => {
    const { store, state } = await setup();
    store.addBoard();
    expect(state().data.boards.map((b) => b.name)).toEqual(['My sounds', 'New board']);
    expect(currentBoard(state()).name).toBe('New board');
  });

  it('renames a board, and a blank name becomes Soundboard', async () => {
    const { store, state } = await setup();
    const id = state().boardId;
    store.renameBoard(id, '  Memes  ');
    expect(currentBoard(state()).name).toBe('Memes');
    store.renameBoard(id, '   ');
    expect(currentBoard(state()).name).toBe('Soundboard');
  });

  it('keeps at least one board', async () => {
    const { store, state } = await setup();
    store.deleteBoard(state().boardId);
    expect(state().data.boards).toHaveLength(1);
    expect(store.undo.getOffer()).toBeNull();
  });

  it('opens the board next to a deleted one, and Undo brings it back where it was', async () => {
    const { store, state } = await setup();
    store.addBoard();
    store.addBoard();
    const [a, b, c] = state().data.boards;
    store.selectBoard(b.id);
    store.deleteBoard(b.id);
    expect(state().data.boards.map((x) => x.id)).toEqual([a.id, c.id]);
    expect(state().boardId).toBe(c.id);
    expect(store.undo.getOffer()?.message).toBe(boardMessages.deleted('New board'));
    store.undo.undoLatest();
    expect(state().data.boards.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
    expect(state().boardId).toBe(b.id);
  });

  it('stays on the same board when a different one is deleted', async () => {
    const { store, state } = await setup();
    store.addBoard();
    const [a, b] = state().data.boards;
    store.selectBoard(a.id);
    store.deleteBoard(b.id);
    expect(state().boardId).toBe(a.id);
  });

  it('closes the edit card when she opens another board', async () => {
    const { store, state } = await setup();
    const sound = await soundOn(store);
    store.editSound(sound.id);
    expect(editingSound(state())?.id).toBe(sound.id);
    store.addBoard();
    expect(state().editingId).toBeNull();
    store.selectBoard('nothing-like-this');
    expect(currentBoard(state()).name).toBe('New board');
  });
});

describe('adding sounds', () => {
  it('adds the files she picks, named after them, with different looks', async () => {
    const { store, state, storage, engine } = await setup();
    await store.addSounds([wavFile('Airhorn.wav'), wavFile('Applause.wav')]);
    const sounds = currentBoard(state()).sounds;
    expect(sounds.map((s) => s.name)).toEqual(['Airhorn', 'Applause']);
    expect(sounds[0]).toMatchObject({ emoji: EMOJIS[0], color: PALETTE[0], volume: 0.8, hotkey: null, originalFileName: 'Airhorn.wav' });
    expect(sounds[1]).toMatchObject({ emoji: EMOJIS[1], color: PALETTE[1] });
    expect(await storage.mediaIds()).toHaveLength(2);
    expect(engine.remember).toHaveBeenCalledTimes(2);
    expect(state().adding).toBe(false);
    expect(state().problems).toEqual([]);
    await store.flush();
    expect((await storage.loadBoards())?.boards[0].sounds).toHaveLength(2);
  });

  it('adds to the board she asked for', async () => {
    const { store, state } = await setup();
    store.addBoard();
    const first = state().data.boards[0];
    await store.addSounds([wavFile()], first.id);
    expect(state().data.boards[0].sounds).toHaveLength(1);
    expect(state().data.boards[1].sounds).toHaveLength(0);
  });

  it('says which file was a problem and still adds the others', async () => {
    const { store, state, storage } = await setup();
    const picture = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])], 'cat.png');
    const empty = new File([], 'nothing.mp3');
    const notSound = new File([new Uint8Array([1, 2, 3, 4])], 'notes.txt');
    await store.addSounds([picture, wavFile('Good.wav'), empty, notSound]);
    expect(currentBoard(state()).sounds.map((s) => s.name)).toEqual(['Good']);
    expect(state().problems).toEqual([
      `cat.png: ${importMessages.picture}`,
      `nothing.mp3: ${importMessages.empty}`,
      `notes.txt: ${importMessages.unsupported}`,
    ]);
    expect(await storage.mediaIds()).toHaveLength(1);
  });

  it('refuses a file over 20 MB', async () => {
    const { store, state } = await setup();
    await store.addSounds([new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'huge.wav')]);
    expect(state().problems).toEqual([`huge.wav: ${importMessages.tooBig}`]);
    expect(currentBoard(state()).sounds).toHaveLength(0);
  });

  it('clears the old problems when she adds more', async () => {
    const { store, state } = await setup();
    await store.addSounds([new File([new Uint8Array([1, 2, 3])], 'a.txt')]);
    expect(state().problems).toHaveLength(1);
    await store.addSounds([wavFile()]);
    expect(state().problems).toEqual([]);
  });

  it('keeps nothing for a file that cannot be played', async () => {
    const engine = fakeEngine({
      decode: vi.fn(async () => {
        throw new SoundProblem('damaged');
      }),
    });
    const { store, state, storage } = await setup(new MemoryStorage(true), engine);
    await store.addSounds([wavFile('Broken.wav')]);
    expect(state().problems).toEqual([`Broken.wav: ${soundMessages.damaged}`]);
    expect(currentBoard(state()).sounds).toHaveLength(0);
    expect(await storage.mediaIds()).toHaveLength(0);
  });

  it('suggests MP3 or WAV when an old iPhone cannot play an OGG', async () => {
    const engine = fakeEngine({
      decode: vi.fn(async () => {
        throw new SoundProblem('ogg');
      }),
    });
    const { store, state } = await setup(new MemoryStorage(true), engine);
    const ogg = new File([new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0])], 'clip.ogg');
    await store.addSounds([ogg]);
    expect(state().problems[0]).toContain('MP3 or WAV');
  });

  it('says so when there is no room to keep a sound', async () => {
    const storage = new MemoryStorage(true);
    storage.putMedia = async () => {
      throw new StorageProblem('full');
    };
    const { store, state } = await setup(storage);
    await store.addSounds([wavFile('Big.wav')]);
    expect(state().problems).toEqual([`Big.wav: ${storageMessages.full}`]);
    expect(currentBoard(state()).sounds).toHaveLength(0);
  });

  it('adds a sound from a recording, with the name she chose', async () => {
    const { store, state } = await setup();
    const result = await store.addSoundBytes({ bytes: makeWav(), ext: 'wav', mime: 'audio/wav', fileName: null, name: 'My laugh' });
    expect(result.ok).toBe(true);
    expect(currentBoard(state()).sounds[0]).toMatchObject({ name: 'My laugh', originalFileName: null });
  });

  it('refuses a recording that is not a sound', async () => {
    const { store } = await setup();
    const result = await store.addSoundBytes({ bytes: new Uint8Array([1, 2, 3]).buffer, ext: 'wav', mime: 'audio/wav', fileName: null });
    expect(result).toEqual({ ok: false, message: importMessages.unsupported });
  });

  it('puts the sound on the first board when its board was deleted meanwhile', async () => {
    const { store, state } = await setup();
    store.addBoard();
    const [first, second] = state().data.boards;
    store.deleteBoard(second.id);
    await store.addSounds([wavFile()], second.id);
    expect(state().data.boards.find((b) => b.id === first.id)?.sounds).toHaveLength(1);
  });
});

describe('editing a sound', () => {
  it('tidies what she types and sends a new volume to the sound engine', async () => {
    const { store, state, engine } = await setup();
    const sound = await soundOn(store);
    store.changeSound(sound.id, { name: 'x'.repeat(60), emoji: '', color: 'red', volume: 2 });
    const changed = currentBoard(state()).sounds[0];
    expect(changed.name.length).toBeLessThanOrEqual(48);
    expect(changed.name.endsWith('…')).toBe(true);
    expect(changed.emoji).toBe('🔊');
    expect(changed.color).toBe('#7C3AED');
    expect(changed.volume).toBe(1);
    expect(engine.setSoundVolume).toHaveBeenCalledWith(sound.id, 1);
  });

  it('keeps the sound, and the edit card, when only the name changes', async () => {
    const { store, state, engine } = await setup();
    const sound = await soundOn(store);
    store.editSound(sound.id);
    store.changeSound(sound.id, { name: 'Horn' });
    expect(state().editingId).toBe(sound.id);
    expect(engine.setSoundVolume).not.toHaveBeenCalled();
  });

  it('opens and closes the edit card, and ignores sounds that are not there', async () => {
    const { store, state } = await setup();
    const sound = await soundOn(store);
    store.editSound(sound.id);
    expect(state().editingId).toBe(sound.id);
    store.editSound('nope');
    expect(state().editingId).toBeNull();
    store.editSound(sound.id);
    store.editSound(null);
    expect(state().editingId).toBeNull();
  });

  it('saves a change a moment later, and straight away when asked', async () => {
    vi.useFakeTimers();
    try {
      const { store, storage } = await setup();
      const sound = await soundOn(store);
      await store.flush();
      store.changeSound(sound.id, { name: 'Horn' });
      expect((await storage.loadBoards())?.boards[0].sounds[0].name).toBe('Airhorn');
      await vi.advanceTimersByTimeAsync(400);
      expect((await storage.loadBoards())?.boards[0].sounds[0].name).toBe('Horn');
      store.changeSound(sound.id, { name: 'Honk' });
      await store.flush();
      expect((await storage.loadBoards())?.boards[0].sounds[0].name).toBe('Honk');
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves a sound to the end of another board and says so', async () => {
    vi.useFakeTimers();
    try {
      const { store, state } = await setup();
      const sound = await soundOn(store);
      store.addBoard();
      const [first, second] = state().data.boards;
      store.selectBoard(first.id);
      store.editSound(sound.id);
      store.moveSound(sound.id, second.id);
      expect(state().data.boards[0].sounds).toHaveLength(0);
      expect(state().data.boards[1].sounds.map((s) => s.id)).toEqual([sound.id]);
      expect(state().boardId).toBe(first.id);
      expect(state().editingId).toBeNull();
      expect(state().notice).toBe(boardMessages.moved('Airhorn', 'New board'));
      vi.advanceTimersByTime(6000);
      expect(state().notice).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does nothing when a sound is moved to the board it is already on', async () => {
    const { store, state } = await setup();
    const sound = await soundOn(store);
    store.moveSound(sound.id, state().boardId);
    expect(state().notice).toBeNull();
    expect(currentBoard(state()).sounds).toHaveLength(1);
  });
});

describe('Delete, then Undo', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('puts a deleted sound back exactly where it was', async () => {
    const { store, state } = await setup();
    await store.addSounds([wavFile('A.wav'), wavFile('B.wav'), wavFile('C.wav')]);
    const [a, b, c] = currentBoard(state()).sounds;
    store.editSound(b.id);
    store.deleteSound(b.id);
    expect(currentBoard(state()).sounds.map((s) => s.id)).toEqual([a.id, c.id]);
    expect(state().editingId).toBeNull();
    expect(store.undo.getOffer()?.message).toBe('Deleted “B”');
    store.undo.undoLatest();
    expect(currentBoard(state()).sounds.map((s) => s.id)).toEqual([a.id, b.id, c.id]);
  });

  it('opens the board a sound comes back to', async () => {
    const { store, state } = await setup();
    const sound = await soundOn(store);
    const first = state().boardId;
    store.deleteSound(sound.id);
    store.addBoard();
    expect(state().boardId).not.toBe(first);
    store.undo.undoLatest();
    expect(state().boardId).toBe(first);
    expect(currentBoard(state()).sounds[0].id).toBe(sound.id);
  });

  it('throws the audio file away only once Undo has run out', async () => {
    const { store, storage, engine } = await setup();
    const sound = await soundOn(store);
    store.deleteSound(sound.id);
    await store.sweep();
    expect(await storage.hasMedia(sound.mediaId)).toBe(true);
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    await store.sweep();
    expect(await storage.hasMedia(sound.mediaId)).toBe(false);
    expect(engine.forget).toHaveBeenCalledWith(sound.mediaId);
  });

  it('keeps the audio file for good after Undo', async () => {
    const { store, storage } = await setup();
    const sound = await soundOn(store);
    store.deleteSound(sound.id);
    store.undo.undoLatest();
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    await store.sweep();
    expect(await storage.hasMedia(sound.mediaId)).toBe(true);
    await store.flush();
    expect((await storage.loadBoards())?.boards[0].sounds).toHaveLength(1);
  });

  it('keeps the files of a deleted board for Undo, and throws them away afterwards', async () => {
    const { store, state, storage } = await setup();
    store.addBoard();
    const second = state().data.boards[1];
    await store.addSounds([wavFile('A.wav'), wavFile('B.wav')], second.id);
    const files = state().data.boards[1].sounds.map((s) => s.mediaId);
    store.deleteBoard(second.id);
    await store.sweep();
    for (const id of files) expect(await storage.hasMedia(id)).toBe(true);
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    await store.sweep();
    for (const id of files) expect(await storage.hasMedia(id)).toBe(false);
  });

  it('brings back a board with its sounds', async () => {
    const { store, state } = await setup();
    store.addBoard();
    const second = state().data.boards[1];
    await store.addSounds([wavFile('A.wav')], second.id);
    store.deleteBoard(second.id);
    store.undo.undoLatest();
    expect(state().data.boards[1].sounds.map((s) => s.name)).toEqual(['A']);
  });

  it('keeps every file a delete could still bring back when another one finishes', async () => {
    const { store, storage } = await setup();
    const a = await soundOn(store, 'A.wav');
    const b = await soundOn(store, 'B.wav');
    store.deleteSound(a.id);
    vi.advanceTimersByTime(6000);
    store.deleteSound(b.id);
    vi.advanceTimersByTime(4000);
    await store.sweep();
    expect(await storage.hasMedia(a.mediaId)).toBe(false);
    expect(await storage.hasMedia(b.mediaId)).toBe(true);
  });
});

describe('replacing the file of a sound', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('swaps the audio and keeps the name, colour and volume', async () => {
    const { store, state, storage } = await setup();
    const sound = await soundOn(store);
    store.changeSound(sound.id, { name: 'Horn', color: '#DB2777', volume: 0.5 });
    await store.replaceSound(sound.id, wavFile('New horn.wav'));
    const replaced = currentBoard(state()).sounds[0];
    expect(replaced).toMatchObject({ id: sound.id, name: 'Horn', color: '#DB2777', volume: 0.5, originalFileName: 'New horn.wav' });
    expect(replaced.mediaId).not.toBe(sound.mediaId);
    expect(store.undo.getOffer()?.message).toBe(boardMessages.replaced('Horn'));
    expect(await storage.hasMedia(sound.mediaId)).toBe(true);
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    await store.sweep();
    expect(await storage.hasMedia(sound.mediaId)).toBe(false);
    expect(await storage.hasMedia(replaced.mediaId)).toBe(true);
  });

  it('goes back to the old file with Undo and throws the new one away', async () => {
    const { store, state, storage } = await setup();
    const sound = await soundOn(store);
    await store.replaceSound(sound.id, wavFile('New horn.wav'));
    const newMedia = currentBoard(state()).sounds[0].mediaId;
    store.undo.undoLatest();
    expect(currentBoard(state()).sounds[0]).toMatchObject({ mediaId: sound.mediaId, originalFileName: 'Airhorn.wav' });
    await store.sweep();
    expect(await storage.hasMedia(newMedia)).toBe(false);
    expect(await storage.hasMedia(sound.mediaId)).toBe(true);
  });

  it('leaves the sound alone when the new file is no good', async () => {
    const { store, state } = await setup();
    const sound = await soundOn(store);
    await store.replaceSound(sound.id, new File([new Uint8Array([1, 2, 3])], 'notes.txt'));
    expect(currentBoard(state()).sounds[0].mediaId).toBe(sound.mediaId);
    expect(state().problems).toEqual([`notes.txt: ${importMessages.unsupported}`]);
    expect(store.undo.getOffer()).toBeNull();
  });

  it('can be replaced from a recording', async () => {
    const { store, state } = await setup();
    const sound = await soundOn(store);
    const result = await store.replaceSoundBytes(sound.id, { bytes: makeWav(0.5), ext: 'wav', mime: 'audio/wav', fileName: null });
    expect(result).toEqual({ ok: true });
    expect(currentBoard(state()).sounds[0].mediaId).not.toBe(sound.mediaId);
  });
});

describe('playing', () => {
  it('plays the sound at its own volume', async () => {
    const { store, engine } = await setup();
    const sound = await soundOn(store);
    store.changeSound(sound.id, { volume: 0.35 });
    await store.play(sound.id);
    expect(engine.play).toHaveBeenCalledWith({ id: sound.id, mediaId: sound.mediaId, volume: 0.35 });
  });

  it('shows why a sound could not play, once however many times she taps it', async () => {
    const engine = fakeEngine({ play: vi.fn(async () => ({ ok: false, message: soundMessages.missing }) as PlayResult) });
    const { store, state } = await setup(new MemoryStorage(true), engine);
    const sound = await soundOn(store);
    await store.play(sound.id);
    await store.play(sound.id);
    expect(state().problems).toEqual([soundMessages.missing]);
  });

  it('ignores a sound that is not there any more', async () => {
    const { store, engine } = await setup();
    expect(await store.play('gone')).toEqual({ ok: true });
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('stops everything and sets the master volume', async () => {
    const { store, state, engine } = await setup();
    store.stopAll();
    expect(engine.stopAll).toHaveBeenCalledTimes(1);
    store.setMasterVolume(0.3);
    expect(state().data.masterVolume).toBe(0.3);
    expect(engine.setMasterVolume).toHaveBeenLastCalledWith(0.3);
    store.setMasterVolume(7);
    expect(state().data.masterVolume).toBe(1);
  });

  it('keeps the Stop all key with her boards', async () => {
    const { store, state } = await setup();
    store.setStopAllKey('ctrl+alt+0');
    expect(state().data.stopAllKey).toBe('Ctrl+Alt+0');
    store.setStopAllKey(null);
    expect(state().data.stopAllKey).toBeNull();
  });
});

describe('messages and settings', () => {
  it('lets her dismiss a problem and clears them all', async () => {
    const { store, state } = await setup();
    store.addProblem('One');
    store.addProblem('Two');
    store.addProblem('One');
    expect(state().problems).toEqual(['One', 'Two']);
    store.dismissProblem(0);
    expect(state().problems).toEqual(['Two']);
    store.clearProblems();
    expect(state().problems).toEqual([]);
  });

  it('keeps device settings and shows a problem if they cannot be saved', async () => {
    const storage = new MemoryStorage(true);
    const { store, state } = await setup(storage);
    store.updateSettings({ lastBackupAt: 123 });
    expect((await storage.loadSettings()).lastBackupAt).toBe(123);
    storage.saveSettings = async () => {
      throw new StorageProblem('failed');
    };
    store.updateSettings({ soundKeysEnabled: false });
    await Promise.resolve();
    await Promise.resolve();
    expect(state().settings.soundKeysEnabled).toBe(false);
    expect(state().problems).toEqual([storageMessages.failed]);
  });

  it('shows a problem when her boards cannot be saved', async () => {
    const storage = new MemoryStorage(true);
    const { store, state } = await setup(storage);
    storage.saveBoards = async () => {
      throw new StorageProblem('full');
    };
    store.addBoard();
    await store.flush();
    expect(state().problems).toEqual([storageMessages.full]);
  });
});

describe('keeping audio files safe', () => {
  it('does not throw away a file that a new sound is still being made from', async () => {
    const { store, storage } = await setup();
    const [id] = await storage.putMedia([{ data: makeWav(), ext: 'wav', mime: 'audio/wav' }]);
    const release = store.reserveMedia(id);
    await store.sweep();
    expect(await storage.hasMedia(id)).toBe(true);
    release();
    release();
    await store.sweep();
    expect(await storage.hasMedia(id)).toBe(false);
  });

  it('does not throw away a file that another window has saved a sound with', async () => {
    const { store, storage } = await setup();
    const [id] = await storage.putMedia([{ data: makeWav(), ext: 'wav', mime: 'audio/wav' }]);
    await storage.saveBoards({
      boards: [
        {
          id: 'b',
          name: 'Elsewhere',
          sounds: [{ id: 's', name: 'S', emoji: '🔊', color: '#7C3AED', mediaId: id, originalFileName: null, volume: 0.8, hotkey: null }],
        },
      ],
      masterVolume: 1,
      stopAllKey: null,
    });
    await store.sweep();
    expect(await storage.hasMedia(id)).toBe(true);
  });
});

describe('replacing everything', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('takes the new boards, and Undo gives the old ones back', async () => {
    const { store, state, storage, engine } = await setup();
    const sound = await soundOn(store);
    const [newMedia] = await storage.putMedia([{ data: makeWav(), ext: 'wav', mime: 'audio/wav' }]);
    store.replaceBoards(
      {
        boards: [{ id: 'new', name: 'From backup', sounds: [{ ...sound, id: 'moved', mediaId: newMedia }] }],
        masterVolume: 0.5,
        stopAllKey: null,
      },
      'Replaced your sounds with the backup',
    );
    expect(state().data.boards.map((b) => b.name)).toEqual(['From backup']);
    expect(state().boardId).toBe('new');
    expect(engine.stopAll).toHaveBeenCalled();
    expect(engine.setMasterVolume).toHaveBeenLastCalledWith(0.5);
    expect(store.undo.getOffer()?.message).toBe('Replaced your sounds with the backup');
    await store.sweep();
    expect(await storage.hasMedia(sound.mediaId)).toBe(true);

    store.undo.undoLatest();
    expect(currentBoard(state()).sounds.map((s) => s.id)).toEqual([sound.id]);
    expect(engine.setMasterVolume).toHaveBeenLastCalledWith(1);
    await store.sweep();
    expect(await storage.hasMedia(sound.mediaId)).toBe(true);
    expect(await storage.hasMedia(newMedia)).toBe(false);
  });

  it('lets go of the old files once Undo has run out', async () => {
    const { store, storage } = await setup();
    const sound = await soundOn(store);
    store.replaceBoards({ boards: [], masterVolume: 1, stopAllKey: null });
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    await store.sweep();
    expect(await storage.hasMedia(sound.mediaId)).toBe(false);
  });

  it('opens the board it is asked to, and Undo goes back to the board she was on', async () => {
    const { store, state } = await setup();
    const sound = await soundOn(store);
    const before = state().boardId;
    const data = {
      boards: [
        ...state().data.boards,
        { id: 'from-backup', name: 'From backup', sounds: [{ ...sound, id: 'other', mediaId: sound.mediaId }] },
      ],
      masterVolume: 1,
      stopAllKey: null,
    };
    store.replaceBoards(data, 'Added your backup', 'from-backup');
    expect(state().boardId).toBe('from-backup');
    expect(state().data.boards.map((b) => b.name)).toEqual(['My sounds', 'From backup']);

    store.undo.undoLatest();
    expect(state().boardId).toBe(before);
    expect(state().data.boards.map((b) => b.name)).toEqual(['My sounds']);
  });

  it('opens the first board when the board it is asked for is not there', async () => {
    const { store, state } = await setup();
    store.replaceBoards(
      { boards: [{ id: 'a', name: 'A', sounds: [] }, { id: 'b', name: 'B', sounds: [] }], masterVolume: 1, stopAllKey: null },
      'Replaced your sounds',
      'nowhere',
    );
    expect(state().boardId).toBe('a');
  });
});
