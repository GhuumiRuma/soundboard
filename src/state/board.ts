/**
 * What the Soundboard page does when she changes something: add, rename and delete boards, add and edit and delete
 * sounds, volume, and "Delete, then Undo". It holds her boards in memory for the screen, keeps them on the device,
 * and keeps the sound engine in step. The plain rules for the changes live in src/model/boards.ts.
 *
 * This file never touches the page or the browser directly: its storage and sound engine are passed in, so the
 * tests can run it with stand-ins.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { SoundProblem, soundMessages, type AudioBufferLike, type PlayableSound, type PlayResult } from '../audio/engine';
import { newId } from '../lib/id';
import * as ops from '../model/boards';
import type { BoardsData, Soundboard, SoundItem } from '../model/types';
import {
  DEFAULT_SETTINGS,
  StorageProblem,
  checkSoundBytes,
  createSaver,
  readSoundFile,
  storageMessages,
  unusedMediaIds,
  type AppSettings,
  type AudioExt,
  type StorageBackend,
} from '../storage';
import { UndoStack } from './undo';

/** The wording for things the page tells her. It follows StreamStudio's: plain, and what happened. */
export const boardMessages = {
  deleted: (name: string) => `Deleted “${name}”`,
  replaced: (name: string) => `Replaced the file for “${name}”`,
  moved: (name: string, board: string) => `Moved “${name}” to ${board}.`,
  couldNotAdd: 'That sound could not be added.',
  couldNotRead:
    "I couldn't open your saved sounds. Close this page and open it again. Nothing has been changed.",
} as const;

/** The few things the page needs from the sound engine. The real SoundEngine fits this. */
export interface BoardEngine {
  play(sound: PlayableSound): Promise<PlayResult>;
  stopAll(): void;
  setMasterVolume(volume: number): void;
  setSoundVolume(soundId: string, volume: number): void;
  decode(bytes: ArrayBuffer, ext: AudioExt): Promise<AudioBufferLike>;
  remember(mediaId: string, buffer: AudioBufferLike): void;
  forget(mediaId: string): void;
  preload(mediaIds: readonly string[]): Promise<void>;
}

export interface BoardDeps {
  storage: StorageBackend;
  engine: BoardEngine;
  undo?: UndoStack;
  /** How long a short message stays on the screen, in milliseconds. */
  noticeMs?: number;
}

export interface BoardState {
  /** False until her boards have been read from this device. */
  loaded: boolean;
  /** False when this browser won't keep her sounds once the page is closed. */
  persistent: boolean;
  data: BoardsData;
  settings: AppSettings;
  /** The board whose tab is open. It is always one of her boards. */
  boardId: string;
  /** The sound whose edit card (or sheet) is open. */
  editingId: string | null;
  /** Things that went wrong and that she should read. She dismisses them. */
  problems: readonly string[];
  /** True while sounds are being added. */
  adding: boolean;
  /** A short friendly message that goes away on its own. */
  notice: string | null;
}

export interface NewSoundBytes {
  bytes: ArrayBuffer;
  ext: AudioExt;
  mime: string;
  /** The name of the file she picked, if there was one. */
  fileName: string | null;
  /** Leave this out to name the sound after its file. */
  name?: string;
}

export type AddResult = { ok: true; sound: SoundItem } | { ok: false; message: string };
export type ReplaceResult = { ok: true } | { ok: false; message: string };

export interface BoardStore {
  readonly state: StoreApi<BoardState>;
  readonly undo: UndoStack;
  load(): Promise<void>;
  selectBoard(boardId: string): void;
  editSound(soundId: string | null): void;
  addBoard(): void;
  renameBoard(boardId: string, name: string): void;
  deleteBoard(boardId: string): void;
  /** Adds the files she picked or dropped. Each one that can't be added is listed in `problems`. */
  addSounds(files: readonly File[], boardId?: string): Promise<void>;
  /** Adds a sound from audio that is already in hand, like a recording. */
  addSoundBytes(input: NewSoundBytes, boardId?: string): Promise<AddResult>;
  replaceSound(soundId: string, file: File): Promise<void>;
  replaceSoundBytes(soundId: string, input: NewSoundBytes): Promise<ReplaceResult>;
  changeSound(soundId: string, changes: ops.SoundChanges): void;
  deleteSound(soundId: string): void;
  moveSound(soundId: string, boardId: string): void;
  setMasterVolume(volume: number): void;
  setStopAllKey(key: string | null): void;
  /** Plays a sound. Call this straight from the tap or key press. */
  play(soundId: string): Promise<PlayResult>;
  stopAll(): void;
  updateSettings(changes: Partial<AppSettings>): void;
  /** Takes her boards from somewhere else (a restored backup). The old ones can be brought back with Undo. */
  replaceBoards(data: BoardsData, message?: string): void;
  /** Lets the page tell her something. It goes away by itself. */
  showNotice(text: string): void;
  addProblem(message: string): void;
  dismissProblem(index: number): void;
  clearProblems(): void;
  /** Saves everything right now, for when the page is about to close. */
  flush(): Promise<void>;
  /** Throws away audio files nothing needs any more. */
  sweep(): Promise<void>;
  /** Keeps an audio file safe from sweep() while a new sound that uses it is still being made. */
  reserveMedia(mediaId: string): () => void;
}

function initialState(): BoardState {
  const data = ops.emptyBoards();
  return {
    loaded: false,
    persistent: true,
    data,
    settings: { ...DEFAULT_SETTINGS },
    boardId: data.boards[0].id,
    editingId: null,
    problems: [],
    adding: false,
    notice: null,
  };
}

const NOTICE_MS = 6000;

export function createBoardStore(deps: BoardDeps): BoardStore {
  const { storage, engine } = deps;
  const undo = deps.undo ?? new UndoStack();
  const state = createStore<BoardState>(() => initialState());
  const get = state.getState;
  const set = state.setState;

  /** True when her saved boards couldn't be read. Nothing is written then, so nothing she has is replaced. */
  let readFailed = false;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  let activeAdds = 0;
  let sweeping: Promise<void> = Promise.resolve();
  const reserved = new Map<string, number>();

  function addProblem(message: string): void {
    const current = get().problems;
    if (!current.includes(message)) set({ problems: [...current, message] });
  }

  function problemFrom(error: unknown, fallback: string): string {
    if (error instanceof StorageProblem || error instanceof SoundProblem) return error.message;
    return fallback;
  }

  const saver = createSaver(
    async (data) => {
      if (!readFailed) await storage.saveBoards(data);
    },
    (error) => addProblem(problemFrom(error, storageMessages.failed)),
  );

  /** Puts new boards on the screen and keeps them on the device. */
  function apply(next: BoardsData, options: { flush?: boolean; boardId?: string } = {}): void {
    const current = get();
    if (next === current.data && !options.boardId) return;
    const wanted = options.boardId ?? current.boardId;
    const boardId = ops.findBoard(next, wanted) ? wanted : next.boards[0].id;
    const editing = ops.findSound(next, current.editingId);
    const editingId = editing && editing.board.id === boardId ? current.editingId : null;
    set({ data: next, boardId, editingId });
    saver.schedule(next);
    if (options.flush) void saver.flush();
  }

  function reserveMedia(mediaId: string): () => void {
    reserved.set(mediaId, (reserved.get(mediaId) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const count = (reserved.get(mediaId) ?? 1) - 1;
      if (count > 0) reserved.set(mediaId, count);
      else reserved.delete(mediaId);
    };
  }

  function sweep(): Promise<void> {
    const run = async () => {
      try {
        const stored = await storage.mediaIds();
        // What is used is worked out now, after the list is read, so a sound added a moment ago is never thrown away.
        const onDisk = await storage.loadBoards();
        const keep = [...undo.held(), ...reserved.keys(), ...(onDisk ? ops.referencedMediaIds(onDisk) : [])];
        const unused = unusedMediaIds(stored, get().data, keep);
        if (unused.length === 0) return;
        await storage.deleteMedia(unused);
        for (const id of unused) engine.forget(id);
      } catch {
        // Tidying up can wait: it is tried again the next time the app starts.
      }
    };
    sweeping = sweeping.then(run);
    return sweeping;
  }

  function showNotice(text: string): void {
    clearTimeout(noticeTimer);
    set({ notice: text });
    noticeTimer = setTimeout(() => set({ notice: null }), deps.noticeMs ?? NOTICE_MS);
  }

  async function decodeAndKeep(input: NewSoundBytes): Promise<{ ok: true; mediaId: string; buffer: AudioBufferLike; release: () => void } | { ok: false; message: string }> {
    let buffer: AudioBufferLike;
    try {
      buffer = await engine.decode(input.bytes, input.ext);
    } catch (error) {
      return { ok: false, message: error instanceof SoundProblem ? error.message : soundMessages.damaged };
    }
    const mediaId = newId();
    const release = reserveMedia(mediaId);
    try {
      await storage.putMedia([{ id: mediaId, data: input.bytes, ext: input.ext, mime: input.mime }]);
    } catch (error) {
      release();
      return { ok: false, message: problemFrom(error, storageMessages.failed) };
    }
    return { ok: true, mediaId, buffer, release };
  }

  async function addOne(input: NewSoundBytes, boardId: string): Promise<AddResult> {
    const kept = await decodeAndKeep(input);
    if (!kept.ok) return kept;
    try {
      const data = get().data;
      // She may have deleted the board while the sound was being read.
      const target = ops.findBoard(data, boardId) ? boardId : data.boards[0].id;
      const added = ops.addSound(data, target, { mediaId: kept.mediaId, originalFileName: input.fileName, name: input.name });
      if (!added) {
        void storage.deleteMedia([kept.mediaId]).catch(() => undefined);
        return { ok: false, message: boardMessages.couldNotAdd };
      }
      engine.remember(kept.mediaId, kept.buffer);
      apply(added.data, { flush: true });
      return { ok: true, sound: added.sound };
    } finally {
      kept.release();
    }
  }

  async function tracked<T>(job: () => Promise<T>): Promise<T> {
    activeAdds += 1;
    set({ adding: true });
    try {
      return await job();
    } finally {
      activeAdds -= 1;
      if (activeAdds === 0) set({ adding: false });
    }
  }

  async function swapFile(soundId: string, input: NewSoundBytes): Promise<ReplaceResult> {
    const before = ops.findSound(get().data, soundId);
    if (!before) return { ok: false, message: boardMessages.couldNotAdd };
    const kept = await decodeAndKeep(input);
    if (!kept.ok) return kept;
    try {
      const found = ops.findSound(get().data, soundId);
      if (!found) {
        void storage.deleteMedia([kept.mediaId]).catch(() => undefined);
        return { ok: false, message: boardMessages.couldNotAdd };
      }
      const old = { mediaId: found.sound.mediaId, fileName: found.sound.originalFileName };
      engine.remember(kept.mediaId, kept.buffer);
      apply(ops.updateSound(get().data, soundId, { mediaId: kept.mediaId, originalFileName: input.fileName }), { flush: true });
      undo.offer({
        message: boardMessages.replaced(found.sound.name),
        holds: [old.mediaId],
        undo: () => {
          apply(ops.updateSound(get().data, soundId, { mediaId: old.mediaId, originalFileName: old.fileName }), { flush: true });
          void sweep();
        },
        commit: () => void sweep(),
      });
      return { ok: true };
    } finally {
      kept.release();
    }
  }

  const fileInput = (file: File, bytes: ArrayBuffer, ext: AudioExt, mime: string): NewSoundBytes => ({
    bytes,
    ext,
    mime,
    fileName: file.name || null,
  });

  const store: BoardStore = {
    state,
    undo,

    async load() {
      let stored: BoardsData | null = null;
      let settings: AppSettings = { ...DEFAULT_SETTINGS };
      try {
        [stored, settings] = await Promise.all([storage.loadBoards(), storage.loadSettings()]);
      } catch {
        readFailed = true;
        addProblem(boardMessages.couldNotRead);
      }
      const data = stored ?? ops.emptyBoards();
      set({
        loaded: true,
        persistent: storage.persistent,
        data,
        settings,
        boardId: data.boards[0].id,
        editingId: null,
      });
      engine.setMasterVolume(data.masterVolume);
      void engine.preload([...ops.referencedMediaIds(data)]);
      if (!readFailed) void sweep();
    },

    selectBoard(boardId) {
      if (!ops.findBoard(get().data, boardId)) return;
      set({ boardId, editingId: null });
    },

    editSound(soundId) {
      const found = soundId === null ? null : ops.findSound(get().data, soundId);
      set({ editingId: found ? found.sound.id : null });
    },

    addBoard() {
      const { data, board } = ops.addBoard(get().data);
      apply(data, { flush: true, boardId: board.id });
    },

    renameBoard(boardId, name) {
      apply(ops.renameBoard(get().data, boardId, name));
    },

    deleteBoard(boardId) {
      const current = get();
      const result = ops.removeBoard(current.data, boardId);
      if (!result) return;
      const { board, index } = result.removed;
      const neighbour = result.data.boards[Math.min(index, result.data.boards.length - 1)];
      apply(result.data, { flush: true, boardId: current.boardId === boardId ? neighbour.id : current.boardId });
      undo.offer({
        message: boardMessages.deleted(board.name),
        holds: board.sounds.map((sound) => sound.mediaId),
        undo: () => apply(ops.restoreBoard(get().data, result.removed), { flush: true, boardId: board.id }),
        commit: () => void sweep(),
      });
    },

    async addSounds(files, boardId) {
      const target = boardId ?? get().boardId;
      set({ problems: [] });
      await tracked(async () => {
        for (const file of files) {
          const read = await readSoundFile(file);
          const outcome = read.ok ? await addOne(fileInput(file, read.bytes, read.ext, read.mime), target) : read;
          if (!outcome.ok) addProblem(`${file.name || 'That file'}: ${outcome.message}`);
        }
      });
    },

    addSoundBytes(input, boardId) {
      const checked = checkSoundBytes(input.bytes);
      if (!checked.ok) return Promise.resolve(checked);
      return tracked(() => addOne(input, boardId ?? get().boardId));
    },

    async replaceSound(soundId, file) {
      const read = await readSoundFile(file);
      if (!read.ok) {
        addProblem(`${file.name || 'That file'}: ${read.message}`);
        return;
      }
      const outcome = await tracked(() => swapFile(soundId, fileInput(file, read.bytes, read.ext, read.mime)));
      if (!outcome.ok) addProblem(`${file.name || 'That file'}: ${outcome.message}`);
    },

    replaceSoundBytes(soundId, input) {
      const checked = checkSoundBytes(input.bytes);
      if (!checked.ok) return Promise.resolve(checked);
      return tracked(() => swapFile(soundId, input));
    },

    changeSound(soundId, changes) {
      const current = get().data;
      const next = ops.updateSound(current, soundId, changes);
      if (next === current) return;
      apply(next);
      if (changes.volume !== undefined) {
        const found = ops.findSound(next, soundId);
        if (found) engine.setSoundVolume(soundId, found.sound.volume);
      }
    },

    deleteSound(soundId) {
      const result = ops.removeSound(get().data, soundId);
      if (!result) return;
      const { sound } = result.removed;
      apply(result.data, { flush: true });
      undo.offer({
        message: boardMessages.deleted(sound.name),
        holds: [sound.mediaId],
        undo: () => {
          const restored = ops.restoreSound(get().data, result.removed);
          const back = ops.findSound(restored, sound.id);
          apply(restored, { flush: true, boardId: back?.board.id });
        },
        commit: () => void sweep(),
      });
    },

    moveSound(soundId, boardId) {
      const found = ops.findSound(get().data, soundId);
      const target = ops.findBoard(get().data, boardId);
      if (!found || !target || found.board.id === target.id) return;
      apply(ops.moveSound(get().data, soundId, boardId), { flush: true });
      showNotice(boardMessages.moved(found.sound.name, target.name));
    },

    setMasterVolume(volume) {
      const next = ops.setMasterVolume(get().data, volume);
      engine.setMasterVolume(next.masterVolume);
      apply(next);
    },

    setStopAllKey(key) {
      apply(ops.setStopAllKey(get().data, key), { flush: true });
    },

    play(soundId) {
      const found = ops.findSound(get().data, soundId);
      if (!found) return Promise.resolve({ ok: true });
      const { sound } = found;
      return engine.play({ id: sound.id, mediaId: sound.mediaId, volume: sound.volume }).then((result) => {
        if (!result.ok) addProblem(result.message);
        return result;
      });
    },

    stopAll() {
      engine.stopAll();
    },

    updateSettings(changes) {
      const settings = { ...get().settings, ...changes };
      set({ settings });
      storage.saveSettings(settings).catch((error) => addProblem(problemFrom(error, storageMessages.failed)));
    },

    replaceBoards(data, message = 'Replaced your sounds') {
      const before = get().data;
      const boardBefore = get().boardId;
      const next = ops.normalizeBoards(data);
      engine.stopAll();
      engine.setMasterVolume(next.masterVolume);
      apply(next, { flush: true, boardId: next.boards[0].id });
      undo.offer({
        message,
        holds: [...ops.referencedMediaIds(before)],
        undo: () => {
          engine.setMasterVolume(before.masterVolume);
          apply(before, { flush: true, boardId: boardBefore });
          void sweep();
        },
        commit: () => void sweep(),
      });
      void engine.preload([...ops.referencedMediaIds(next)]);
    },

    showNotice,
    addProblem,

    dismissProblem(index) {
      set({ problems: get().problems.filter((_, i) => i !== index) });
    },

    clearProblems() {
      set({ problems: [] });
    },

    flush: () => saver.flush(),
    sweep,
    reserveMedia,
  };
  return store;
}

/** The board whose tab is open. */
export function currentBoard(s: BoardState): Soundboard {
  return ops.findBoard(s.data, s.boardId) ?? s.data.boards[0];
}

/** The sound that is being edited, or null. */
export function editingSound(s: BoardState): SoundItem | null {
  return s.editingId ? (ops.findSound(s.data, s.editingId)?.sound ?? null) : null;
}
