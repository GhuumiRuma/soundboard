import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addSound, emptyBoards } from '../model/boards';
import type { BoardsData } from '../model/types';
import { bytesOf, makeWav } from '../test/audio';
import { IdbStorage, isQuotaError, normalizeSettings } from './idb';
import { MemoryStorage } from './memory';
import { DEFAULT_SETTINGS, StorageProblem, storageMessages, type StorageBackend } from './types';

let counter = 0;
const uniqueName = () => `soundboard-test-${++counter}`;

const backends: [string, () => Promise<StorageBackend>][] = [
  ['IdbStorage (IndexedDB)', () => IdbStorage.open(uniqueName())],
  ['MemoryStorage', async () => new MemoryStorage()],
];

function sampleBoards(mediaId = 'media-1'): BoardsData {
  const base = emptyBoards();
  return addSound(base, base.boards[0].id, { mediaId, originalFileName: 'air-horn.wav' })!.data;
}

describe.each(backends)('%s', (_label, open) => {
  let storage: StorageBackend;

  beforeEach(async () => {
    storage = await open();
  });
  afterEach(() => {
    storage.close();
    vi.unstubAllGlobals();
  });

  it('starts with nothing saved', async () => {
    expect(await storage.loadBoards()).toBeNull();
    expect(await storage.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await storage.mediaIds()).toEqual([]);
  });

  it('keeps her boards', async () => {
    const boards = sampleBoards();
    await storage.saveBoards(boards);
    expect(await storage.loadBoards()).toEqual(boards);
  });

  it('tidies what it loads, the same way a backup is tidied', async () => {
    const messy = {
      boards: [{ id: 'b', name: '  ', sounds: [{ id: 's', name: 'x'.repeat(100), mediaId: 'm', color: 'red', volume: 7, emoji: '' }] }],
      masterVolume: -3,
    };
    await storage.saveBoards(messy as unknown as BoardsData);
    const loaded = await storage.loadBoards();
    expect(loaded?.masterVolume).toBe(0);
    expect(loaded?.boards[0].name).toBe('Soundboard');
    expect(loaded?.boards[0].sounds[0]).toMatchObject({ color: '#7C3AED', volume: 1, emoji: '🔊' });
    expect(loaded?.boards[0].sounds[0].name.length).toBeLessThanOrEqual(48);
  });

  it('keeps her settings', async () => {
    const settings = { soundKeysEnabled: false, lastBackupAt: 1_700_000_000_000, remindAfter: 1_700_100_000_000 };
    await storage.saveSettings(settings);
    expect(await storage.loadSettings()).toEqual(settings);
  });

  it('keeps audio files and gives the bytes back exactly', async () => {
    const wav = makeWav(0.05);
    const [id] = await storage.putMedia([{ data: wav, ext: 'wav', mime: 'audio/wav' }]);
    expect(id).toBeTruthy();
    expect(await storage.hasMedia(id)).toBe(true);
    const record = await storage.getMedia(id);
    expect(record).toMatchObject({ id, ext: 'wav', mime: 'audio/wav' });
    expect(new Uint8Array(record!.data)).toEqual(new Uint8Array(wav));
    expect(await storage.mediaIds()).toEqual([id]);
  });

  it('gives each new audio file its own id', async () => {
    const ids = await storage.putMedia([
      { data: bytesOf(1), ext: 'mp3', mime: 'audio/mpeg' },
      { data: bytesOf(2), ext: 'mp3', mime: 'audio/mpeg' },
    ]);
    expect(new Set(ids).size).toBe(2);
  });

  it('keeps an audio file under the id it is given (for a restored backup)', async () => {
    const ids = await storage.putMedia([{ id: 'from-backup', data: bytesOf(9, 9), ext: 'ogg', mime: 'audio/ogg' }]);
    expect(ids).toEqual(['from-backup']);
    expect((await storage.getMedia('from-backup'))?.ext).toBe('ogg');
  });

  it("doesn't let playing a sound use up the saved copy", async () => {
    const wav = makeWav(0.05);
    const [id] = await storage.putMedia([{ data: wav, ext: 'wav', mime: 'audio/wav' }]);
    const first = await storage.getMedia(id);
    // Decoding a sound takes its bytes away, so what we hand out must be a copy.
    structuredClone(first!.data, { transfer: [first!.data] });
    expect(first!.data.byteLength).toBe(0);
    const second = await storage.getMedia(id);
    expect(second!.data.byteLength).toBe(wav.byteLength);
  });

  it('says how big each audio file is without needing the file', async () => {
    const [a, b] = await storage.putMedia([
      { data: new ArrayBuffer(10), ext: 'wav', mime: 'audio/wav' },
      { data: new ArrayBuffer(2500), ext: 'mp3', mime: 'audio/mpeg' },
    ]);
    expect(await storage.mediaSizes()).toEqual(
      new Map([
        [a, 10],
        [b, 2500],
      ]),
    );
    await storage.deleteMedia([a]);
    expect(await storage.mediaSizes()).toEqual(new Map([[b, 2500]]));
  });

  it('deletes audio files, and ignores ones that are not there', async () => {
    const [a, b] = await storage.putMedia([
      { data: bytesOf(1), ext: 'wav', mime: 'audio/wav' },
      { data: bytesOf(2), ext: 'wav', mime: 'audio/wav' },
    ]);
    await storage.deleteMedia([a, 'never-existed']);
    expect(await storage.hasMedia(a)).toBe(false);
    expect(await storage.getMedia(a)).toBeUndefined();
    expect(await storage.mediaIds()).toEqual([b]);
    await storage.deleteMedia([]);
    expect(await storage.mediaIds()).toEqual([b]);
  });

  it('asks the browser to keep the sounds when it can', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const persisted = vi.fn().mockResolvedValue(false);
    vi.stubGlobal('navigator', { storage: { persist, persisted } });
    const granted = await storage.requestPersistence();
    // The memory copy can't be kept by the browser, whatever it says.
    expect(granted).toBe(storage instanceof IdbStorage);
  });
});

describe('IdbStorage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('still has everything after the app is closed and opened again', async () => {
    const name = uniqueName();
    const first = await IdbStorage.open(name);
    const boards = sampleBoards('kept');
    const [id] = await first.putMedia([{ id: 'kept', data: makeWav(0.02), ext: 'wav', mime: 'audio/wav' }]);
    await first.saveBoards(boards);
    await first.saveSettings({ ...DEFAULT_SETTINGS, soundKeysEnabled: false });
    first.close();

    const second = await IdbStorage.open(name);
    expect(await second.loadBoards()).toEqual(boards);
    expect((await second.loadSettings()).soundKeysEnabled).toBe(false);
    expect(await second.hasMedia(id)).toBe(true);
    second.close();
  });

  it('keeps separate databases separate', async () => {
    const a = await IdbStorage.open(uniqueName());
    const b = await IdbStorage.open(uniqueName());
    await a.saveBoards(sampleBoards());
    expect(await b.loadBoards()).toBeNull();
    a.close();
    b.close();
  });

  it('asks for persistence once, and not at all when it is already granted', async () => {
    const storage = await IdbStorage.open(uniqueName());
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', { storage: { persist, persisted: vi.fn().mockResolvedValue(true) } });
    expect(await storage.requestPersistence()).toBe(true);
    expect(persist).not.toHaveBeenCalled();

    vi.stubGlobal('navigator', { storage: { persist, persisted: vi.fn().mockResolvedValue(false) } });
    expect(await storage.requestPersistence()).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
    storage.close();
  });

  it('copes with a browser that has no persistence, or refuses it', async () => {
    const storage = await IdbStorage.open(uniqueName());
    vi.stubGlobal('navigator', {});
    expect(await storage.requestPersistence()).toBe(false);
    vi.stubGlobal('navigator', { storage: { persist: vi.fn().mockRejectedValue(new Error('no')) } });
    expect(await storage.requestPersistence()).toBe(false);
    vi.stubGlobal('navigator', { storage: { persist: vi.fn().mockResolvedValue(false) } });
    expect(await storage.requestPersistence()).toBe(false);
    storage.close();
  });
});

describe('when the device is full', () => {
  afterEach(() => vi.restoreAllMocks());

  function makeSavingFail(errorName: string) {
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('problem', errorName);
    });
  }

  it('tells her when an audio file does not fit', async () => {
    const storage = await IdbStorage.open(uniqueName());
    makeSavingFail('QuotaExceededError');
    const attempt = storage.putMedia([{ data: bytesOf(1, 2, 3), ext: 'wav', mime: 'audio/wav' }]);
    await expect(attempt).rejects.toBeInstanceOf(StorageProblem);
    await expect(attempt).rejects.toMatchObject({ kind: 'full', message: storageMessages.full });
    storage.close();
  });

  it('tells her when her boards do not fit', async () => {
    const storage = await IdbStorage.open(uniqueName());
    makeSavingFail('QuotaExceededError');
    await expect(storage.saveBoards(sampleBoards())).rejects.toMatchObject({ kind: 'full' });
    await expect(storage.saveSettings(DEFAULT_SETTINGS)).rejects.toMatchObject({ kind: 'full' });
    storage.close();
  });

  it('gives a general message for any other saving problem', async () => {
    const storage = await IdbStorage.open(uniqueName());
    makeSavingFail('DataError');
    await expect(storage.saveBoards(sampleBoards())).rejects.toMatchObject({ kind: 'failed', message: storageMessages.failed });
    storage.close();
  });

  it('recognises the browser saying there is no room', () => {
    expect(isQuotaError(new DOMException('full', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaError(new DOMException('other', 'DataError'))).toBe(false);
    expect(isQuotaError(new Error('x'))).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
  });

  it('says so in plain words', () => {
    const full = new StorageProblem('full');
    expect(full.message).toBe(storageMessages.full);
    expect(full.message).toMatch(/enough room/);
    expect(new StorageProblem('failed').message).toBe(storageMessages.failed);
    expect(full).toBeInstanceOf(Error);
  });
});

describe('normalizeSettings', () => {
  it('uses the defaults for anything odd', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('x')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ soundKeysEnabled: 'yes', lastBackupAt: -1, remindAfter: Number.NaN })).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps what is valid', () => {
    expect(normalizeSettings({ soundKeysEnabled: false, lastBackupAt: 5, remindAfter: 9 })).toEqual({
      soundKeysEnabled: false,
      lastBackupAt: 5,
      remindAfter: 9,
    });
  });
});
