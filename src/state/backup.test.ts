import { unzipSync, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backupMessages, leftOutMessage, skippedMessages } from '../backup';
import type { FileToSave, SaveOutcome } from '../platform/types';
import { StorageProblem } from '../storage';
import { MemoryStorage } from '../storage/memory';
import { makeWav } from '../test/audio';
import { fakeEngine } from '../test/engine';
import { deferred } from '../test/webaudio';
import { createBackupController } from './backup';
import { createBoardStore, currentBoard, type BoardStore } from './board';

const NOW = new Date(2026, 4, 10, 15, 30).getTime();
const FILE_NAME = 'Soundboard backup 2026-05-10.zip';

const made: BoardStore[] = [];
afterEach(() => {
  while (made.length > 0) made.pop()?.undo.dispose();
});

/** One device: its own storage and boards, and a backup controller wired to stand-ins for the file box and the saver. */
async function device() {
  const storage = new MemoryStorage(true);
  const store = createBoardStore({ storage, engine: fakeEngine() });
  made.push(store);
  await store.load();
  const saveFile = vi.fn(async (_file: FileToSave): Promise<SaveOutcome> => ({ status: 'saved', where: 'your Downloads folder' }));
  const onRestored = vi.fn();
  const chosen: { files: File[] } = { files: [] };
  const pick = vi.fn(async () => chosen.files);
  const controller = createBackupController({ store, storage, saveFile, pick, now: () => NOW, onRestored });
  return { storage, store, controller, saveFile, onRestored, pick, chosen, state: store.state.getState };
}
type Device = Awaited<ReturnType<typeof device>>;

const wav = (name: string) => new File([makeWav()], `${name}.wav`, { type: 'audio/wav' });
const addSounds = (d: Device, ...names: string[]) => d.store.addSounds(names.map(wav));
const soundNames = (d: Device) => currentBoard(d.state()).sounds.map((s) => s.name);
const phase = (d: Device) => d.controller.view.getState().phase;

/** The backup file a device makes when she saves one. */
async function backupOf(d: Device): Promise<File> {
  await d.controller.save();
  const file = d.saveFile.mock.calls.at(-1)?.[0];
  if (!file) throw new Error('nothing was saved');
  return new File([file.data], file.fileName, { type: file.mimeType });
}

function choosing(d: Device) {
  const view = d.controller.view.getState();
  if (view.phase !== 'choosing') throw new Error(`expected to be choosing, but it is ${view.phase}`);
  return view;
}

/** A device that already has a sound, with a backup from another device waiting to be restored. */
async function readyToChoose(...backupSounds: string[]) {
  const a = await device();
  await addSounds(a, ...backupSounds);
  a.store.renameBoard(a.state().boardId, 'Memes');
  const file = await backupOf(a);
  const b = await device();
  await addSounds(b, 'Quack');
  b.chosen.files = [file];
  await b.controller.choose();
  return { a, b, file };
}

describe('saving a backup', () => {
  it('hands a zip with her sounds to be saved, and says where it went', async () => {
    const d = await device();
    await addSounds(d, 'Honk', 'Boing');
    await d.controller.save();

    expect(d.saveFile).toHaveBeenCalledTimes(1);
    const file = d.saveFile.mock.calls[0][0];
    expect(file).toMatchObject({ fileName: FILE_NAME, mimeType: 'application/zip', title: 'Soundboard backup' });
    const names = Object.keys(unzipSync(new Uint8Array(await file.data.arrayBuffer())));
    expect(names).toContain('boards.json');
    expect(names.filter((name) => name.startsWith('sounds/'))).toHaveLength(2);
    expect(d.state().notice).toBe('Saved your backup to your Downloads folder.');
    expect(d.state().problems).toEqual([]);
    expect(phase(d)).toBe('idle');
  });

  it('remembers when she last saved one, and drops any "remind me later"', async () => {
    const d = await device();
    await addSounds(d, 'Honk');
    d.store.updateSettings({ remindAfter: NOW + 1000 });
    await d.controller.save();
    expect(d.state().settings.lastBackupAt).toBe(NOW);
    expect(d.state().settings.remindAfter).toBeNull();
  });

  it('counts a backup she shared from a phone, and says nothing more', async () => {
    const d = await device();
    d.saveFile.mockResolvedValueOnce({ status: 'shared' });
    await addSounds(d, 'Honk');
    await d.controller.save();
    expect(d.state().settings.lastBackupAt).toBe(NOW);
    expect(d.state().notice).toBeNull();
    expect(d.state().problems).toEqual([]);
  });

  it('does not count a backup she backed out of', async () => {
    const d = await device();
    d.saveFile.mockResolvedValueOnce({ status: 'cancelled' });
    await addSounds(d, 'Honk');
    await d.controller.save();
    expect(d.state().settings.lastBackupAt).toBeNull();
    expect(d.state().notice).toBeNull();
    expect(d.state().problems).toEqual([]);
  });

  it('says so when the file could not be saved, and does not count it', async () => {
    const d = await device();
    d.saveFile.mockResolvedValueOnce({ status: 'failed', message: "I couldn't save that file. Please try again." });
    await addSounds(d, 'Honk');
    await d.controller.save();
    expect(d.state().problems).toEqual(["I couldn't save that file. Please try again."]);
    expect(d.state().settings.lastBackupAt).toBeNull();
    expect(phase(d)).toBe('idle');
  });

  it('says so when the saver itself breaks', async () => {
    const d = await device();
    d.saveFile.mockRejectedValueOnce(new Error('disk on fire'));
    await addSounds(d, 'Honk');
    await d.controller.save();
    expect(d.state().problems).toEqual([backupMessages.couldNotSave]);
    expect(phase(d)).toBe('idle');
  });

  it('has nothing to save when she has no sounds', async () => {
    const d = await device();
    await d.controller.save();
    expect(d.saveFile).not.toHaveBeenCalled();
    expect(d.state().problems).toEqual([backupMessages.nothingToSave]);
    expect(phase(d)).toBe('idle');
  });

  it('names the sounds whose files are gone, and still saves the rest', async () => {
    const d = await device();
    await addSounds(d, 'Honk', 'Boing');
    const honk = currentBoard(d.state()).sounds[0];
    await d.storage.deleteMedia([honk.mediaId]);
    await d.controller.save();
    expect(d.saveFile).toHaveBeenCalledTimes(1);
    expect(d.state().problems).toEqual([leftOutMessage(['Honk'])]);
    expect(d.state().settings.lastBackupAt).toBe(NOW);
  });

  it('does not change her sounds', async () => {
    const d = await device();
    await addSounds(d, 'Honk', 'Boing');
    const before = d.state().data;
    await d.controller.save();
    expect(d.state().data).toBe(before);
    expect(d.store.undo.getOffer()).toBeNull();
  });

  it('is busy while it works, and ignores a second tap', async () => {
    const d = await device();
    const hold = deferred<SaveOutcome>();
    d.saveFile.mockReturnValueOnce(hold.promise);
    await addSounds(d, 'Honk');

    const first = d.controller.save();
    await vi.waitFor(() => expect(d.saveFile).toHaveBeenCalled());
    expect(phase(d)).toBe('saving');
    await d.controller.save();
    hold.resolve({ status: 'cancelled' });
    await first;

    expect(d.saveFile).toHaveBeenCalledTimes(1);
    expect(phase(d)).toBe('idle');
  });
});

describe('restoring onto a device with no sounds', () => {
  it('puts everything back without asking', async () => {
    const a = await device();
    await addSounds(a, 'Honk', 'Boing');
    a.store.setMasterVolume(0.4);
    const file = await backupOf(a);

    const b = await device();
    b.chosen.files = [file];
    await b.controller.choose();

    expect(phase(b)).toBe('idle');
    expect(b.state().data.boards.map((board) => board.name)).toEqual(['My sounds']);
    expect(soundNames(b)).toEqual(['Honk', 'Boing']);
    expect(b.state().data.masterVolume).toBe(0.4);
    expect(b.store.undo.getOffer()?.message).toBe('Restored your backup: 1 board and 2 sounds');
    expect(b.onRestored).toHaveBeenCalledTimes(1);
    expect(b.state().problems).toEqual([]);
  });

  it('keeps the audio on the device, and keeps it after a clean-up', async () => {
    const a = await device();
    await addSounds(a, 'Honk');
    const original = await a.storage.getMedia(currentBoard(a.state()).sounds[0].mediaId);
    const file = await backupOf(a);

    const b = await device();
    b.chosen.files = [file];
    await b.controller.choose();
    await b.store.flush();
    await b.store.sweep();

    const [restored] = currentBoard(b.state()).sounds;
    const stored = await b.storage.getMedia(restored.mediaId);
    expect(stored?.data.byteLength).toBe(original?.data.byteLength);
    expect(Array.from(new Uint8Array(stored?.data ?? new ArrayBuffer(0)))).toEqual(Array.from(new Uint8Array(original?.data ?? new ArrayBuffer(0))));
    expect(await b.storage.mediaIds()).toEqual([restored.mediaId]);

    const reopened = createBoardStore({ storage: b.storage, engine: fakeEngine() });
    made.push(reopened);
    await reopened.load();
    expect(currentBoard(reopened.state.getState()).sounds.map((s) => s.name)).toEqual(['Honk']);
  });

  it('says nothing when she closes the file box without picking a file', async () => {
    const d = await device();
    await d.controller.choose();
    expect(phase(d)).toBe('idle');
    expect(d.state().problems).toEqual([]);
    expect(d.onRestored).not.toHaveBeenCalled();
  });

  it('opens the file box before it does anything else, so the browser lets it open', async () => {
    const d = await device();
    const choosingNow = d.controller.choose();
    expect(d.pick).toHaveBeenCalledTimes(1);
    await choosingNow;
  });

  it('says so when the file is not a backup, and changes nothing', async () => {
    const d = await device();
    d.chosen.files = [new File(['just some words'], 'notes.zip', { type: 'application/zip' })];
    await d.controller.choose();
    expect(d.state().problems).toEqual([backupMessages.notABackup]);
    expect(phase(d)).toBe('idle');
    expect(d.state().data.boards.map((board) => board.name)).toEqual(['My sounds']);
    expect(d.onRestored).not.toHaveBeenCalled();
  });

  it('lists the sounds that could not be brought back', async () => {
    const a = await device();
    await addSounds(a, 'Honk', 'Boing');
    const whole = await backupOf(a);
    const entries = unzipSync(new Uint8Array(await whole.arrayBuffer()));
    delete entries['sounds/Boing.wav'];
    const partial = new File([zipSync(entries)], whole.name, { type: 'application/zip' });

    const b = await device();
    b.chosen.files = [partial];
    await b.controller.choose();
    expect(soundNames(b)).toEqual(['Honk']);
    expect(b.state().problems).toEqual(skippedMessages([{ name: 'Boing', reason: 'missing' }]));
  });
});

describe('restoring onto a device that already has sounds', () => {
  it('asks first, and has changed nothing yet', async () => {
    const { b } = await readyToChoose('Honk', 'Boing');
    const view = choosing(b);
    expect(view.fileName).toBe(FILE_NAME);
    expect(view.opened.boards).toBe(1);
    expect(view.opened.sounds).toBe(2);
    expect(soundNames(b)).toEqual(['Quack']);
    expect(await b.storage.mediaIds()).toHaveLength(1);
    expect(b.onRestored).not.toHaveBeenCalled();
    expect(b.store.undo.getOffer()).toBeNull();
  });

  it('adds the backup after what she has, and opens its first board', async () => {
    const { b } = await readyToChoose('Honk');
    await b.controller.restore('add');

    expect(phase(b)).toBe('idle');
    expect(b.state().data.boards.map((board) => board.name)).toEqual(['My sounds', 'Memes']);
    expect(currentBoard(b.state()).name).toBe('Memes');
    expect(soundNames(b)).toEqual(['Honk']);
    expect(b.state().data.boards[0].sounds.map((s) => s.name)).toEqual(['Quack']);
    expect(b.store.undo.getOffer()?.message).toBe('Added 1 board and 1 sound from your backup');
    expect(b.onRestored).toHaveBeenCalledTimes(1);
  });

  it('takes the added boards away again with Undo, and keeps only her own sound files', async () => {
    const { b } = await readyToChoose('Honk');
    await b.controller.restore('add');
    expect(await b.storage.mediaIds()).toHaveLength(2);

    b.store.undo.undoLatest();
    expect(b.state().data.boards.map((board) => board.name)).toEqual(['My sounds']);
    await b.store.sweep();
    expect(await b.storage.mediaIds()).toEqual([b.state().data.boards[0].sounds[0].mediaId]);
  });

  it('replaces everything when she says so', async () => {
    const { b } = await readyToChoose('Honk');
    await b.controller.restore('replace');

    expect(b.state().data.boards.map((board) => board.name)).toEqual(['Memes']);
    expect(soundNames(b)).toEqual(['Honk']);
    expect(b.store.undo.getOffer()?.message).toBe('Restored your backup: 1 board and 1 sound');
    expect(b.onRestored).toHaveBeenCalledTimes(1);
  });

  it('gives her old sounds back with Undo after a replace, and drops the backup ones', async () => {
    const { b } = await readyToChoose('Honk');
    await b.controller.restore('replace');
    b.store.undo.undoLatest();

    expect(b.state().data.boards.map((board) => board.name)).toEqual(['My sounds']);
    expect(soundNames(b)).toEqual(['Quack']);
    await b.store.sweep();
    expect(await b.storage.mediaIds()).toEqual([currentBoard(b.state()).sounds[0].mediaId]);
  });

  it('leaves off a sound key that one of her sounds already uses, and says so', async () => {
    const a = await device();
    await addSounds(a, 'Honk');
    a.store.changeSound(currentBoard(a.state()).sounds[0].id, { hotkey: 'Ctrl+1' });
    const file = await backupOf(a);

    const b = await device();
    await addSounds(b, 'Quack');
    b.store.changeSound(currentBoard(b.state()).sounds[0].id, { hotkey: 'Ctrl+1' });
    b.chosen.files = [file];
    await b.controller.choose();
    await b.controller.restore('add');

    expect(b.state().data.boards[0].sounds[0].hotkey).toBe('Ctrl+1');
    expect(b.state().data.boards[1].sounds[0].hotkey).toBeNull();
    expect(b.store.undo.getOffer()?.message).toBe(
      'Added 1 board and 1 sound from your backup. 1 sound key was already in use, so I left it off.',
    );
  });

  it('forgets the backup when she cancels, so a late tap on Replace does nothing', async () => {
    const { b } = await readyToChoose('Honk');
    b.controller.cancel();
    expect(phase(b)).toBe('idle');

    await b.controller.restore('replace');
    expect(b.state().data.boards.map((board) => board.name)).toEqual(['My sounds']);
    expect(soundNames(b)).toEqual(['Quack']);
    expect(b.onRestored).not.toHaveBeenCalled();
    expect(b.store.undo.getOffer()).toBeNull();
  });

  it('throws away a backup that finishes reading after she cancelled', async () => {
    const a = await device();
    await addSounds(a, 'Honk');
    const file = await backupOf(a);
    const bytes = await file.arrayBuffer();

    const b = await device();
    await addSounds(b, 'Quack');
    const hold = deferred<ArrayBuffer>();
    const slow = new File([bytes], file.name, { type: 'application/zip' });
    vi.spyOn(slow, 'arrayBuffer').mockReturnValue(hold.promise);
    b.chosen.files = [slow];

    const choosingNow = b.controller.choose();
    await vi.waitFor(() => expect(phase(b)).toBe('reading'));
    b.controller.cancel();
    expect(phase(b)).toBe('idle');
    hold.resolve(bytes);
    await choosingNow;

    expect(phase(b)).toBe('idle');
    expect(b.onRestored).not.toHaveBeenCalled();
  });

  it('does nothing when asked to restore before any backup was chosen', async () => {
    const d = await device();
    await addSounds(d, 'Quack');
    await d.controller.restore('replace');
    expect(soundNames(d)).toEqual(['Quack']);
    expect(d.state().problems).toEqual([]);
    expect(d.store.undo.getOffer()).toBeNull();
  });
});

describe('when a restore goes wrong', () => {
  it('says the device is full, and changes nothing', async () => {
    const { b } = await readyToChoose('Honk');
    vi.spyOn(b.storage, 'putMedia').mockRejectedValueOnce(new StorageProblem('full'));
    await b.controller.restore('add');

    expect(b.state().problems).toEqual([backupMessages.noRoom]);
    expect(b.state().data.boards.map((board) => board.name)).toEqual(['My sounds']);
    expect(b.store.undo.getOffer()).toBeNull();
    expect(b.onRestored).not.toHaveBeenCalled();
    expect(phase(b)).toBe('idle');
  });

  it('says it could not restore when the sounds could not be kept', async () => {
    const { b } = await readyToChoose('Honk');
    vi.spyOn(b.storage, 'putMedia').mockRejectedValueOnce(new StorageProblem('failed'));
    await b.controller.restore('replace');

    expect(b.state().problems).toEqual([backupMessages.restoreFailed]);
    expect(soundNames(b)).toEqual(['Quack']);
    expect(phase(b)).toBe('idle');
  });

  it('throws away the audio it had already kept', async () => {
    const { b } = await readyToChoose('Honk');
    vi.spyOn(b.store, 'replaceBoards').mockImplementationOnce(() => {
      throw new Error('boom');
    });
    await b.controller.restore('add');
    await b.store.sweep();

    expect(b.state().problems).toEqual([backupMessages.restoreFailed]);
    expect(await b.storage.mediaIds()).toEqual([b.state().data.boards[0].sounds[0].mediaId]);
    expect(b.onRestored).not.toHaveBeenCalled();
  });
});
