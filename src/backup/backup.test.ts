import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { addBoard, addSound, allSounds, emptyBoards, setMasterVolume, setStopAllKey, updateSound } from '../model/boards';
import type { BoardsData } from '../model/types';
import { MAX_SOUND_BYTES, importMessages } from '../storage/import';
import { MemoryStorage } from '../storage/memory';
import { fakeMp3Bytes, makeWav } from '../test/audio';
import { BackupProblem, backupMessages } from './messages';
import { openBackup, openBackupBytes } from './read';
import { makeBackup, type MadeBackup, type MakeBackupInput } from './write';

const NOW = new Date(2025, 4, 12, 9, 30);

interface Library {
  storage: MemoryStorage;
  data: BoardsData;
  wav: ArrayBuffer;
  mp3: ArrayBuffer;
  wavId: string;
  mp3Id: string;
}

/** Two boards and three sounds: "Air horn" and "Bell" share one WAV file, "Honk" is an MP3. */
async function library(): Promise<Library> {
  const storage = new MemoryStorage();
  const wav = makeWav(0.2, 440);
  const mp3 = fakeMp3Bytes(300);
  const [wavId, mp3Id] = await storage.putMedia([
    { data: wav, ext: 'wav', mime: 'audio/wav' },
    { data: mp3, ext: 'mp3', mime: 'audio/mpeg' },
  ]);
  const first = emptyBoards().boards[0].id;
  let data: BoardsData = { ...emptyBoards(), boards: [{ id: first, name: 'My sounds', sounds: [] }] };
  const horn = addSound(data, first, { name: 'Air horn', mediaId: wavId, originalFileName: 'air-horn.wav' })!;
  data = updateSound(horn.data, horn.sound.id, { volume: 0.5, hotkey: 'Ctrl+Shift+1', color: '#DB2777', emoji: '📣' });
  data = addSound(data, first, { name: 'Honk', mediaId: mp3Id, originalFileName: 'honk.mp3' })!.data;
  const memes = addBoard(data, 'Memes');
  data = addSound(memes.data, memes.board.id, { name: 'Bell', mediaId: wavId, originalFileName: null })!.data;
  data = setStopAllKey(setMasterVolume(data, 0.6), 'Ctrl+Shift+0');
  return { storage, data, wav, mp3, wavId, mp3Id };
}

const make = (lib: Library, more: Partial<MakeBackupInput> = {}): Promise<MadeBackup> =>
  makeBackup({ data: lib.data, readMedia: (id) => lib.storage.getMedia(id), now: NOW, appVersion: '1.2.3', ...more });

const bytesOfBlob = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

/** Everything about the boards that is not an id, so two copies can be compared. */
const describeBoards = (data: BoardsData) =>
  data.boards.map((board) => ({
    name: board.name,
    sounds: board.sounds.map(({ name, emoji, color, volume, hotkey, originalFileName }) => ({
      name,
      emoji,
      color,
      volume,
      hotkey,
      originalFileName,
    })),
  }));

// ---- Backups made by hand, the way another program or a damaged copy might have them ----

const text = (value: unknown): Uint8Array => strToU8(typeof value === 'string' ? value : JSON.stringify(value));
const wavBytes = (): Uint8Array => new Uint8Array(makeWav(0.1));
const soundEntry = (name: string, file: unknown, more: Record<string, unknown> = {}) => ({
  id: `id-${name}`,
  name,
  emoji: '🔊',
  color: '#7C3AED',
  volume: 0.8,
  hotkey: null,
  originalFileName: null,
  file,
  ...more,
});
const manifestOf = (boards: unknown, more: Record<string, unknown> = {}) => ({
  format: 'soundboard-backup',
  version: 1,
  createdAt: NOW.toISOString(),
  appVersion: '1.0.0',
  masterVolume: 0.8,
  stopAllKey: null,
  boards,
  ...more,
});
const oneBoard = (...sounds: unknown[]) => [{ id: 'board-1', name: 'Board', sounds }];
const zipOf = (files: Record<string, Uint8Array>, level: 0 | 1 = 0): Uint8Array => zipSync(files, { level });
const backupOf = (manifest: unknown, files: Record<string, Uint8Array> = {}, level: 0 | 1 = 0): Uint8Array =>
  zipOf({ 'boards.json': text(manifest), ...files }, level);
const simpleBackup = (): Uint8Array =>
  backupOf(manifestOf(oneBoard(soundEntry('Honk', 'sounds/Honk.wav'))), { 'sounds/Honk.wav': wavBytes() });

describe('making a backup', () => {
  it('puts everything in one zip with the boards, a few words for anyone who opens it, and the sounds', async () => {
    const made = await make(await library());
    expect(made.fileName).toBe('Soundboard backup 2025-05-12.zip');
    expect(made.blob.type).toBe('application/zip');
    expect([made.boards, made.sounds, made.missing]).toEqual([2, 3, []]);
    const files = unzipSync(await bytesOfBlob(made.blob));
    expect(Object.keys(files).sort()).toEqual(['README.txt', 'boards.json', 'sounds/Air horn.wav', 'sounds/Honk.mp3']);
  });

  it('describes her boards in boards.json', async () => {
    const lib = await library();
    const files = unzipSync(await bytesOfBlob((await make(lib)).blob));
    const manifest = JSON.parse(new TextDecoder().decode(files['boards.json']));
    expect(manifest).toMatchObject({
      format: 'soundboard-backup',
      version: 1,
      createdAt: NOW.toISOString(),
      appVersion: '1.2.3',
      masterVolume: lib.data.masterVolume,
      stopAllKey: 'Ctrl+Shift+0',
    });
    expect(manifest.boards.map((b: { name: string }) => b.name)).toEqual(['My sounds', 'Memes']);
    expect(manifest.boards[0].sounds[0]).toMatchObject({
      name: 'Air horn',
      emoji: '📣',
      color: '#DB2777',
      volume: 0.5,
      hotkey: 'Ctrl+Shift+1',
      originalFileName: 'air-horn.wav',
      file: 'sounds/Air horn.wav',
    });
    expect(manifest.boards[0].sounds[1]).toMatchObject({ name: 'Honk', file: 'sounds/Honk.mp3' });
  });

  it('keeps a file only once when two sounds use it', async () => {
    const lib = await library();
    const files = unzipSync(await bytesOfBlob((await make(lib)).blob));
    const manifest = JSON.parse(new TextDecoder().decode(files['boards.json']));
    expect(manifest.boards[1].sounds[0]).toMatchObject({ name: 'Bell', file: 'sounds/Air horn.wav' });
    expect(Object.keys(files).filter((name) => name.endsWith('.wav'))).toHaveLength(1);
  });

  it('keeps the audio exactly as it was', async () => {
    const lib = await library();
    const files = unzipSync(await bytesOfBlob((await make(lib)).blob));
    expect(files['sounds/Air horn.wav']).toEqual(new Uint8Array(lib.wav));
    expect(files['sounds/Honk.mp3']).toEqual(new Uint8Array(lib.mp3));
  });

  it('squeezes WAV files and leaves MP3 files as they are', async () => {
    const compression: Record<string, number> = {};
    unzipSync(await bytesOfBlob((await make(await library())).blob), {
      filter: (info) => {
        compression[info.name] = info.compression;
        return false;
      },
    });
    expect(compression['sounds/Air horn.wav']).toBe(8);
    expect(compression['sounds/Honk.mp3']).toBe(0);
  });

  it('tells two sounds with the same name apart', async () => {
    const storage = new MemoryStorage();
    const ids = await storage.putMedia([
      { data: makeWav(0.1, 300), ext: 'wav', mime: 'audio/wav' },
      { data: makeWav(0.1, 600), ext: 'wav', mime: 'audio/wav' },
    ]);
    let data = emptyBoards();
    const board = data.boards[0].id;
    data = addSound(data, board, { name: 'Honk', mediaId: ids[0], originalFileName: null })!.data;
    data = addSound(data, board, { name: 'honk', mediaId: ids[1], originalFileName: null })!.data;
    const made = await makeBackup({ data, readMedia: (id) => storage.getMedia(id), now: NOW });
    const names = Object.keys(unzipSync(await bytesOfBlob(made.blob))).filter((n) => n.startsWith('sounds/'));
    expect(names.sort()).toEqual(['sounds/Honk.wav', 'sounds/honk (2).wav']);
  });

  it('uses the app version when none is given', async () => {
    const lib = await library();
    const files = unzipSync(await bytesOfBlob((await make(lib, { appVersion: undefined })).blob));
    expect(JSON.parse(new TextDecoder().decode(files['boards.json'])).appVersion).toBe(__APP_VERSION__);
  });

  it('leaves out a sound whose file is gone, and says which', async () => {
    const lib = await library();
    const made = await make(lib, { readMedia: async (id) => (id === lib.mp3Id ? undefined : lib.storage.getMedia(id)) });
    expect(made.missing).toEqual(['Honk']);
    expect(made.sounds).toBe(2);
    const opened = openBackupBytes(await bytesOfBlob(made.blob));
    expect(allSounds(opened.data).map((s) => s.name)).toEqual(['Air horn', 'Bell']);
  });

  it('has nothing to back up when she has no sounds', async () => {
    const readMedia = async () => undefined;
    await expect(makeBackup({ data: emptyBoards(), readMedia })).rejects.toThrow(backupMessages.nothingToSave);
    await expect(makeBackup({ data: emptyBoards(), readMedia })).rejects.toBeInstanceOf(BackupProblem);
  });

  it('says so when every file is gone', async () => {
    const lib = await library();
    await expect(make(lib, { readMedia: async () => undefined })).rejects.toThrow(backupMessages.filesGone);
  });

  it('says so when the sounds add up to too much for one backup', async () => {
    const lib = await library();
    // The size is all that is looked at before it is refused, so no real 600 MB is needed.
    const huge = { data: { byteLength: 300 * 1024 * 1024 } as unknown as ArrayBuffer, ext: 'wav' as const };
    await expect(make(lib, { readMedia: async () => huge })).rejects.toThrow(backupMessages.tooBigToSave);
  });

  it('does not pretend a file that failed to read is just missing', async () => {
    const lib = await library();
    const failure = new Error('the disk is not there');
    const result = make(lib, { readMedia: () => Promise.reject(failure) });
    await expect(result).rejects.toBe(failure);
  });

  it('changes nothing she has', async () => {
    const lib = await library();
    const before = structuredClone(lib.data);
    await make(lib);
    expect(lib.data).toEqual(before);
    expect(await lib.storage.mediaIds()).toHaveLength(2);
  });
});

describe('opening a backup you made', () => {
  it('brings back every board and sound exactly as they were', async () => {
    const lib = await library();
    const opened = openBackupBytes(await bytesOfBlob((await make(lib)).blob));
    expect(opened.boards).toBe(2);
    expect(opened.sounds).toBe(3);
    expect(opened.skipped).toEqual([]);
    expect(opened.createdAt?.getTime()).toBe(NOW.getTime());
    expect(describeBoards(opened.data)).toEqual(describeBoards(lib.data));
    expect(opened.data.masterVolume).toBe(lib.data.masterVolume);
    expect(opened.data.stopAllKey).toBe('Ctrl+Shift+0');
  });

  it('brings back the audio files untouched, and a file two sounds use stays shared', async () => {
    const lib = await library();
    const opened = openBackupBytes(await bytesOfBlob((await make(lib)).blob));
    const [horn, honk, bell] = allSounds(opened.data);
    expect(horn.mediaId).toBe(bell.mediaId);
    expect(honk.mediaId).not.toBe(horn.mediaId);
    expect(opened.media).toHaveLength(2);
    const byId = new Map(opened.media.map((m) => [m.id, m]));
    expect(new Uint8Array(byId.get(horn.mediaId)!.data)).toEqual(new Uint8Array(lib.wav));
    expect([byId.get(horn.mediaId)!.ext, byId.get(horn.mediaId)!.mime]).toEqual(['wav', 'audio/wav']);
    expect(new Uint8Array(byId.get(honk.mediaId)!.data)).toEqual(new Uint8Array(lib.mp3));
    expect([byId.get(honk.mediaId)!.ext, byId.get(honk.mediaId)!.mime]).toEqual(['mp3', 'audio/mpeg']);
  });

  it('gives every board, sound and file a new id, so nothing can clash with what is on the device', async () => {
    const lib = await library();
    const opened = openBackupBytes(await bytesOfBlob((await make(lib)).blob));
    const before = new Set([
      ...lib.data.boards.map((b) => b.id),
      ...allSounds(lib.data).map((s) => s.id),
      ...allSounds(lib.data).map((s) => s.mediaId),
    ]);
    const after = [
      ...opened.data.boards.map((b) => b.id),
      ...allSounds(opened.data).map((s) => s.id),
      ...opened.media.map((m) => m.id),
    ];
    expect(after.some((id) => before.has(id))).toBe(false);
    expect(new Set(after).size).toBe(after.length);
  });

  it('only keeps the audio files its sounds use', async () => {
    const lib = await library();
    const opened = openBackupBytes(await bytesOfBlob((await make(lib)).blob));
    expect(new Set(opened.media.map((m) => m.id))).toEqual(new Set(allSounds(opened.data).map((s) => s.mediaId)));
  });

  it('can go straight onto the device', async () => {
    const lib = await library();
    const opened = openBackupBytes(await bytesOfBlob((await make(lib)).blob));
    const device = new MemoryStorage();
    await device.putMedia(opened.media);
    for (const sound of allSounds(opened.data)) expect(await device.hasMedia(sound.mediaId)).toBe(true);
  });

  it('opens the file she picked', async () => {
    const lib = await library();
    const opened = await openBackup((await make(lib)).blob);
    expect(opened.sounds).toBe(3);
  });

  it('says when the file is too big to open', async () => {
    const huge = { size: 600 * 1024 * 1024, arrayBuffer: () => Promise.reject(new Error('no')) } as unknown as Blob;
    await expect(openBackup(huge)).rejects.toThrow(backupMessages.tooBigToOpen);
  });

  it('says when the file can not be read', async () => {
    const gone = { size: 10, arrayBuffer: () => Promise.reject(new Error('gone')) } as unknown as Blob;
    await expect(openBackup(gone)).rejects.toThrow(importMessages.unreadable);
  });
});

describe('files that are not a usable backup', () => {
  it('is not a backup when it is not a zip at all', () => {
    for (const bytes of [text('hello'), new Uint8Array(0), new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])]) {
      expect(() => openBackupBytes(bytes)).toThrow(backupMessages.notABackup);
    }
  });

  it('is damaged when the zip is cut short', async () => {
    const bytes = await bytesOfBlob((await make(await library())).blob);
    expect(() => openBackupBytes(bytes.slice(0, Math.floor(bytes.length / 2)))).toThrow(backupMessages.damaged);
  });

  it('is damaged when it only starts like a zip', () => {
    expect(() => openBackupBytes(new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3, 4, 5, 6, 7]))).toThrow(backupMessages.damaged);
  });

  it('is not a backup when boards.json is not in it', () => {
    expect(() => openBackupBytes(zipOf({ 'other.txt': text('hi') }))).toThrow(backupMessages.notABackup);
  });

  it('is not a backup when boards.json comes from something else', () => {
    expect(() => openBackupBytes(backupOf(manifestOf([], { format: 'something-else' })))).toThrow(backupMessages.notABackup);
    for (const json of ['[]', 'null', '12', '"hello"']) {
      expect(() => openBackupBytes(backupOf(json))).toThrow(backupMessages.notABackup);
    }
  });

  it('is not a backup when boards.json is far too big to be one', () => {
    const big = new Uint8Array(9 * 1024 * 1024);
    expect(() => openBackupBytes(zipOf({ 'boards.json': big }, 1))).toThrow(backupMessages.notABackup);
  });

  it('is damaged when boards.json is not readable text', () => {
    expect(() => openBackupBytes(backupOf('{"format": "soundboard-backup", '))).toThrow(backupMessages.damaged);
  });

  it('asks her to update when it comes from a newer version', () => {
    expect(() => openBackupBytes(backupOf(manifestOf([], { version: 2 })))).toThrow(backupMessages.newer);
  });

  it('is damaged when it does not say which version it is', () => {
    for (const version of [0, -1, '1', null, undefined, Number.NaN]) {
      expect(() => openBackupBytes(backupOf(manifestOf([], { version })))).toThrow(backupMessages.damaged);
    }
  });

  it('opens when a text editor put a byte-order mark at the start', () => {
    const json = `\uFEFF${JSON.stringify(manifestOf(oneBoard(soundEntry('Honk', 'sounds/Honk.wav'))))}`;
    const opened = openBackupBytes(backupOf(json, { 'sounds/Honk.wav': wavBytes() }));
    expect(opened.sounds).toBe(1);
  });

  it('has no sounds when no board has any', () => {
    expect(() => openBackupBytes(backupOf(manifestOf([])))).toThrow(backupMessages.noSounds);
    expect(() => openBackupBytes(backupOf(manifestOf(oneBoard())))).toThrow(backupMessages.noSounds);
    expect(() => openBackupBytes(backupOf(manifestOf('nope')))).toThrow(backupMessages.noSounds);
  });

  it('only ever fails with words that are safe to show', async () => {
    const original = await bytesOfBlob((await make(await library())).blob);
    let seed = 12345;
    const random = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };
    for (let round = 0; round < 80; round++) {
      const copy = original.slice(0, round % 3 === 0 ? random(original.length) : original.length);
      for (let flips = random(8); flips >= 0 && copy.length > 0; flips--) copy[random(copy.length)] = random(256);
      try {
        openBackupBytes(copy);
      } catch (error) {
        expect(error).toBeInstanceOf(BackupProblem);
      }
    }
  });
});

describe('sounds that can not be brought back', () => {
  it('leaves out a sound whose file is not in the backup and keeps the rest', () => {
    const opened = openBackupBytes(
      backupOf(manifestOf(oneBoard(soundEntry('Honk', 'sounds/Honk.wav'), soundEntry('Gone', 'sounds/Gone.wav'))), {
        'sounds/Honk.wav': wavBytes(),
      }),
    );
    expect(allSounds(opened.data).map((s) => s.name)).toEqual(['Honk']);
    expect(opened.skipped).toEqual([{ name: 'Gone', reason: 'missing' }]);
  });

  it('leaves out a sound that has no file named at all', () => {
    const entry = soundEntry('Silent', 'x');
    const noFile = { ...entry, file: undefined };
    for (const file of [undefined, '', '   ', 12, null, 'x'.repeat(600)]) {
      const opened = openBackupBytes(
        backupOf(manifestOf(oneBoard(soundEntry('Honk', 'sounds/Honk.wav'), { ...noFile, file })), {
          'sounds/Honk.wav': wavBytes(),
        }),
      );
      expect(opened.skipped).toEqual([{ name: 'Silent', reason: 'missing' }]);
    }
  });

  it('leaves out a file that is not a sound, however it is named', () => {
    const opened = openBackupBytes(
      backupOf(
        manifestOf(
          oneBoard(
            soundEntry('Honk', 'sounds/Honk.wav'),
            soundEntry('Picture', 'sounds/Picture.mp3'),
            soundEntry('Notes', 'sounds/Notes.wav'),
            soundEntry('Empty', 'sounds/Empty.ogg'),
          ),
        ),
        {
          'sounds/Honk.wav': wavBytes(),
          'sounds/Picture.mp3': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
          'sounds/Notes.wav': text('just some words'),
          'sounds/Empty.ogg': new Uint8Array(0),
        },
      ),
    );
    expect(allSounds(opened.data).map((s) => s.name)).toEqual(['Honk']);
    expect(opened.skipped).toEqual([
      { name: 'Picture', reason: 'broken' },
      { name: 'Notes', reason: 'broken' },
      { name: 'Empty', reason: 'broken' },
    ]);
  });

  it('goes by what is inside a file and not by its ending', () => {
    const opened = openBackupBytes(
      backupOf(manifestOf(oneBoard(soundEntry('Honk', 'sounds/Honk.mp3'))), { 'sounds/Honk.mp3': wavBytes() }),
    );
    expect(opened.media[0]).toMatchObject({ ext: 'wav', mime: 'audio/wav' });
  });

  it('leaves out a sound that is over the size limit, without opening it up', () => {
    const tooBig = new Uint8Array(MAX_SOUND_BYTES + 1);
    tooBig.set(new Uint8Array(makeWav(0.1)));
    const opened = openBackupBytes(
      backupOf(
        manifestOf(oneBoard(soundEntry('Honk', 'sounds/Honk.wav'), soundEntry('Huge', 'sounds/Huge.wav'))),
        { 'sounds/Honk.wav': wavBytes(), 'sounds/Huge.wav': tooBig },
        1,
      ),
    );
    expect(opened.skipped).toEqual([{ name: 'Huge', reason: 'tooBig' }]);
    expect(opened.sounds).toBe(1);
  });

  it('says none could be opened when every sound is left out', () => {
    const bytes = backupOf(manifestOf(oneBoard(soundEntry('Gone', 'sounds/Gone.wav'))));
    expect(() => openBackupBytes(bytes)).toThrow(backupMessages.noneOpened);
  });

  it('keeps a board even when all of its sounds were left out', () => {
    const opened = openBackupBytes(
      backupOf(
        manifestOf([
          { id: 'a', name: 'Fine', sounds: [soundEntry('Honk', 'sounds/Honk.wav')] },
          { id: 'b', name: 'Empty now', sounds: [soundEntry('Gone', 'sounds/Gone.wav')] },
        ]),
        { 'sounds/Honk.wav': wavBytes() },
      ),
    );
    expect(opened.data.boards.map((b) => [b.name, b.sounds.length])).toEqual([
      ['Fine', 1],
      ['Empty now', 0],
    ]);
    expect(opened.boards).toBe(2);
  });

  it('does not follow a file name out of the backup', () => {
    for (const file of ['../../secret.wav', 'C:\\Windows\\media\\tada.wav', 'https://example.com/a.wav', 'sounds/../../a.wav']) {
      const opened = openBackupBytes(
        backupOf(manifestOf(oneBoard(soundEntry('Honk', 'sounds/Honk.wav'), soundEntry('Lost', file))), {
          'sounds/Honk.wav': wavBytes(),
        }),
      );
      expect(opened.skipped).toEqual([{ name: 'Lost', reason: 'missing' }]);
    }
  });

  it('does not take boards.json for a sound', () => {
    const opened = openBackupBytes(
      backupOf(manifestOf(oneBoard(soundEntry('Honk', 'sounds/Honk.wav'), soundEntry('Itself', 'boards.json'))), {
        'sounds/Honk.wav': wavBytes(),
      }),
    );
    expect(opened.skipped).toEqual([{ name: 'Itself', reason: 'broken' }]);
  });
});

describe('tidying what is in a backup', () => {
  it('cleans names, emoji, colours, volumes and keys the same way as anything she types', () => {
    const messy = soundEntry('x'.repeat(100) + '\u0007', 'sounds/a.wav', {
      emoji: '',
      color: 'red',
      volume: 7,
      hotkey: 'banana',
      originalFileName: 'C:\\Users\\her\\a.wav',
    });
    const keyed = soundEntry('Keyed', 'sounds/a.wav', { hotkey: 'ctrl + shift + a', volume: -2 });
    const opened = openBackupBytes(
      backupOf(manifestOf([{ id: 'b', name: '   ', sounds: [messy, keyed] }], { masterVolume: -3, stopAllKey: 'nonsense' }), {
        'sounds/a.wav': wavBytes(),
      }),
    );
    const [first, second] = allSounds(opened.data);
    expect(first).toMatchObject({ color: '#7C3AED', volume: 1, emoji: '🔊', hotkey: null });
    expect(first.name.length).toBeLessThanOrEqual(48);
    expect(first.name).not.toContain('\u0007');
    expect(second).toMatchObject({ hotkey: 'Ctrl+Shift+A', volume: 0 });
    expect(opened.data.boards[0].name).toBe('Soundboard');
    expect(opened.data.masterVolume).toBe(0);
    expect(opened.data.stopAllKey).toBeNull();
  });

  it('copes with a file that is a mess', () => {
    const opened = openBackupBytes(
      backupOf(
        manifestOf(
          [
            null,
            7,
            'board',
            { name: 5, sounds: [null, 3, soundEntry('Honk', 'sounds/Honk.wav', { id: 12, name: 99, volume: 'loud' })] },
            { sounds: 'not a list' },
          ],
          { masterVolume: 'quiet' },
        ),
        { 'sounds/Honk.wav': wavBytes() },
      ),
    );
    expect(opened.sounds).toBe(1);
    expect(opened.data.masterVolume).toBe(1);
    expect(allSounds(opened.data)[0].volume).toBe(0.8);
  });

  it('gives two sounds that share an id in the file ids of their own', () => {
    const opened = openBackupBytes(
      backupOf(
        manifestOf([
          { id: 'same', name: 'One', sounds: [soundEntry('A', 'sounds/a.wav', { id: 'dup' })] },
          { id: 'same', name: 'Two', sounds: [soundEntry('B', 'sounds/a.wav', { id: 'dup' })] },
        ]),
        { 'sounds/a.wav': wavBytes() },
      ),
    );
    const ids = [...opened.data.boards.map((b) => b.id), ...allSounds(opened.data).map((s) => s.id)];
    expect(new Set(ids).size).toBe(4);
    expect(ids).not.toContain('same');
    expect(ids).not.toContain('dup');
  });
});

describe('zip files made by other programs', () => {
  it('opens a backup that was unzipped and zipped again inside one folder', () => {
    const opened = openBackupBytes(
      zipOf({
        'Soundboard backup/boards.json': text(manifestOf(oneBoard(soundEntry('Honk', 'sounds/Honk.wav')))),
        'Soundboard backup/sounds/Honk.wav': wavBytes(),
        'Soundboard backup/README.txt': text('hi'),
      }),
    );
    expect(opened.sounds).toBe(1);
  });

  it('ignores the extra files that Macs and Windows add', () => {
    const opened = openBackupBytes(
      zipOf({
        'Soundboard backup/boards.json': text(manifestOf(oneBoard(soundEntry('Honk', 'sounds/Honk.wav')))),
        'Soundboard backup/sounds/Honk.wav': wavBytes(),
        '__MACOSX/Soundboard backup/._boards.json': text('not json'),
        '__MACOSX/Soundboard backup/sounds/._Honk.wav': text('not a sound'),
        'Soundboard backup/.DS_Store': text('x'),
        'Soundboard backup/Thumbs.db': text('x'),
      }),
    );
    expect(opened.sounds).toBe(1);
    expect(opened.skipped).toEqual([]);
  });

  it('does not mind slashes, capitals, accents or a leading dot-slash in file names', () => {
    const opened = openBackupBytes(
      zipOf({
        'boards.json': text(
          manifestOf(
            oneBoard(
              soundEntry('Slashes', 'Sounds\\AIR HORN.WAV'),
              soundEntry('Dots', './sounds/Air horn.wav'),
              soundEntry('Accents', 'sounds/Café.wav'),
              soundEntry('Absolute', '/sounds/Air horn.wav'),
            ),
          ),
        ),
        'sounds/Air horn.wav': wavBytes(),
        'sounds/Cafe\u0301.wav': wavBytes(),
      }),
    );
    expect(opened.skipped).toEqual([]);
    expect(opened.sounds).toBe(4);
  });

  it('does not look for boards.json deeper than one folder down', () => {
    const bytes = zipOf({ 'a/b/boards.json': text(manifestOf(oneBoard(soundEntry('Honk', 'sounds/Honk.wav')))) });
    expect(() => openBackupBytes(bytes)).toThrow(backupMessages.notABackup);
  });

  it('uses the boards.json nearest the top', () => {
    const opened = openBackupBytes(
      zipOf({
        'old/boards.json': text(manifestOf(oneBoard(soundEntry('Nested', 'sounds/Honk.wav')))),
        'boards.json': text(manifestOf(oneBoard(soundEntry('Top', 'sounds/Honk.wav')))),
        'sounds/Honk.wav': wavBytes(),
      }),
    );
    expect(allSounds(opened.data).map((s) => s.name)).toEqual(['Top']);
  });

  it('opens a backup that holds more files than it needs', () => {
    const opened = openBackupBytes(
      backupOf(manifestOf(oneBoard(soundEntry('Honk', 'sounds/Honk.wav'))), {
        'sounds/Honk.wav': wavBytes(),
        'sounds/Unused.wav': wavBytes(),
        'notes.txt': text('hello'),
      }),
    );
    expect(opened.media).toHaveLength(1);
  });

  it('ends up with the same thing from a copy that was saved without squeezing', () => {
    expect(openBackupBytes(simpleBackup()).sounds).toBe(1);
  });
});
