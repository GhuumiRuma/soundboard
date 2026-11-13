import { describe, expect, it, vi } from 'vitest';
import type { AudioBufferLike, PlayResult } from '../audio/engine';
import { addedText } from '../audio/recorder/messages';
import type { RecordedFile } from '../audio/recorder/session';
import { MemoryStorage } from '../storage/memory';
import { makeWav } from '../test/audio';
import { boardMessages, createBoardStore, currentBoard } from './board';
import { saveRecording } from './recorderSave';

function fakeEngine() {
  return {
    play: vi.fn(async (): Promise<PlayResult> => ({ ok: true })),
    stopAll: vi.fn(),
    setMasterVolume: vi.fn(),
    setSoundVolume: vi.fn(),
    decode: vi.fn(async () => ({ length: 1, numberOfChannels: 1, duration: 0.25 }) as AudioBufferLike),
    remember: vi.fn(),
    forget: vi.fn(),
    preload: vi.fn(async () => undefined),
  };
}

async function setup() {
  const store = createBoardStore({ storage: new MemoryStorage(true), engine: fakeEngine() });
  await store.load();
  return store;
}

const recording = (name = 'My recording'): RecordedFile => ({ bytes: makeWav(0.5), fileName: `${name}.wav`, name });

describe('saving a recording', () => {
  it('adds a new sound to the board that is open and says so', async () => {
    const store = await setup();
    const result = await saveRecording(store, { kind: 'new' }, recording('Door slam'));
    expect(result).toEqual({ ok: true });

    const sounds = currentBoard(store.state.getState()).sounds;
    expect(sounds).toHaveLength(1);
    expect(sounds[0].name).toBe('Door slam');
    expect(sounds[0].originalFileName).toBe('Door slam.wav');
    expect(store.state.getState().notice).toBe(addedText('Door slam', 'My sounds'));
  });

  it('puts the recording in place of the file of a sound she already has', async () => {
    const store = await setup();
    await saveRecording(store, { kind: 'new' }, recording('Laugh'));
    const [sound] = currentBoard(store.state.getState()).sounds;

    const result = await saveRecording(store, { kind: 'replace', soundId: sound.id }, recording('Better laugh'));
    expect(result).toEqual({ ok: true });

    const [after] = currentBoard(store.state.getState()).sounds;
    expect(after.id).toBe(sound.id);
    expect(after.name).toBe('Laugh');
    expect(after.mediaId).not.toBe(sound.mediaId);
    expect(after.originalFileName).toBe('Better laugh.wav');
    expect(store.undo.getOffer()?.message).toBe(boardMessages.replaced('Laugh'));
  });

  it('gives the reason when the sound she meant to replace is gone', async () => {
    const store = await setup();
    const result = await saveRecording(store, { kind: 'replace', soundId: 'nothing-here' }, recording());
    expect(result).toEqual({ ok: false, message: boardMessages.couldNotAdd });
  });

  it('gives the store\'s own message when the recording can not be read', async () => {
    const store = await setup();
    const broken: RecordedFile = { bytes: new Uint8Array([1, 2, 3]).buffer, fileName: 'My recording.wav', name: 'My recording' };
    const result = await saveRecording(store, { kind: 'new' }, broken);
    expect(result.ok).toBe(false);
    expect(currentBoard(store.state.getState()).sounds).toHaveLength(0);
  });
});
