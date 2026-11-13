/**
 * Everything that changes her boards and sounds, as plain functions that return a new copy.
 * Mirrors what StreamStudio's Soundboard page does with its boards (add, rename, delete, move a sound, volume).
 * Nothing in here touches storage or sound, so it is easy to test and is also what a backup is checked with.
 */
import { normalizeKeyString } from '../keys/keyString';
import { newId } from '../lib/id';
import {
  DEFAULT_VOLUME,
  EMOJIS,
  FIRST_BOARD_NAME,
  NEW_BOARD_NAME,
  PALETTE,
  sanitizeBoardName,
  sanitizeColor,
  sanitizeEmoji,
  sanitizeMasterVolume,
  sanitizeSoundName,
  sanitizeVolume,
  soundNameFromFile,
} from './rules';
import type { BoardsData, Soundboard, SoundItem } from './types';

const MAX_FILE_NAME_LENGTH = 200;
const MAX_MEDIA_ID_LENGTH = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A file name is kept only to remind her where a sound came from, so it just has to be one tidy line.
function cleanFileName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\p{Cc}]+/gu, ' ').trim();
  return text === '' ? null : text.slice(0, MAX_FILE_NAME_LENGTH);
}

/** The board she starts with: one empty board called "My sounds". */
export function emptyBoards(): BoardsData {
  return { boards: [{ id: newId(), name: FIRST_BOARD_NAME, sounds: [] }], masterVolume: 1, stopAllKey: null };
}

/**
 * Tidies anything that claims to be her boards: what was saved on the device or what a backup holds.
 * Names, emoji, colours, volumes and keys are cleaned the same way as when she types them, ids are made unique,
 * a sound without an audio file is dropped, and she always ends up with at least one board.
 */
export function normalizeBoards(raw: unknown): BoardsData {
  const source = isRecord(raw) ? raw : {};
  const boardIds = new Set<string>();
  const soundIds = new Set<string>();
  const unique = (value: unknown, taken: Set<string>): string => {
    let id = typeof value === 'string' && value.trim() !== '' && value.length <= MAX_MEDIA_ID_LENGTH ? value : newId();
    while (taken.has(id)) id = newId();
    taken.add(id);
    return id;
  };

  const boards: Soundboard[] = [];
  for (const rawBoard of Array.isArray(source.boards) ? source.boards : []) {
    if (!isRecord(rawBoard)) continue;
    const sounds: SoundItem[] = [];
    for (const rawSound of Array.isArray(rawBoard.sounds) ? rawBoard.sounds : []) {
      if (!isRecord(rawSound)) continue;
      const mediaId = typeof rawSound.mediaId === 'string' ? rawSound.mediaId.trim() : '';
      if (mediaId === '' || mediaId.length > MAX_MEDIA_ID_LENGTH) continue;
      sounds.push({
        id: unique(rawSound.id, soundIds),
        name: sanitizeSoundName(rawSound.name),
        emoji: sanitizeEmoji(rawSound.emoji),
        color: sanitizeColor(rawSound.color),
        mediaId,
        originalFileName: cleanFileName(rawSound.originalFileName),
        volume: sanitizeVolume(rawSound.volume),
        hotkey: normalizeKeyString(typeof rawSound.hotkey === 'string' ? rawSound.hotkey : null),
      });
    }
    boards.push({ id: unique(rawBoard.id, boardIds), name: sanitizeBoardName(rawBoard.name), sounds });
  }
  if (boards.length === 0) boards.push({ id: newId(), name: FIRST_BOARD_NAME, sounds: [] });

  return {
    boards,
    masterVolume: sanitizeMasterVolume(source.masterVolume),
    stopAllKey: normalizeKeyString(typeof source.stopAllKey === 'string' ? source.stopAllKey : null),
  };
}

/** Every sound on every board, in order. */
export function allSounds(data: BoardsData): SoundItem[] {
  return data.boards.flatMap((board) => board.sounds);
}

export function soundCount(data: BoardsData): number {
  return data.boards.reduce((total, board) => total + board.sounds.length, 0);
}

export function findBoard(data: BoardsData, boardId: string | null | undefined): Soundboard | null {
  return data.boards.find((board) => board.id === boardId) ?? null;
}

export function findSound(
  data: BoardsData,
  soundId: string | null | undefined,
): { board: Soundboard; sound: SoundItem; index: number } | null {
  for (const board of data.boards) {
    const index = board.sounds.findIndex((sound) => sound.id === soundId);
    if (index >= 0) return { board, sound: board.sounds[index], index };
  }
  return null;
}

/** The ids of every audio file a sound still uses. A file nobody uses can be thrown away. */
export function referencedMediaIds(data: BoardsData): Set<string> {
  return new Set(allSounds(data).map((sound) => sound.mediaId));
}

function withBoard(data: BoardsData, boardId: string, change: (board: Soundboard) => Soundboard): BoardsData {
  return { ...data, boards: data.boards.map((board) => (board.id === boardId ? change(board) : board)) };
}

/** A new empty board, named "New board". */
export function addBoard(data: BoardsData, name: string = NEW_BOARD_NAME): { data: BoardsData; board: Soundboard } {
  const board: Soundboard = { id: newId(), name: sanitizeBoardName(name), sounds: [] };
  return { data: { ...data, boards: [...data.boards, board] }, board };
}

export function renameBoard(data: BoardsData, boardId: string, name: string): BoardsData {
  return withBoard(data, boardId, (board) => ({ ...board, name: sanitizeBoardName(name) }));
}

export interface RemovedBoard {
  board: Soundboard;
  index: number;
}

/** Takes a board away. At least one board always stays, so the last one can't be deleted (null). */
export function removeBoard(data: BoardsData, boardId: string): { data: BoardsData; removed: RemovedBoard } | null {
  const index = data.boards.findIndex((board) => board.id === boardId);
  if (index < 0 || data.boards.length <= 1) return null;
  return {
    data: { ...data, boards: data.boards.filter((board) => board.id !== boardId) },
    removed: { board: data.boards[index], index },
  };
}

/** Puts a deleted board back where it was. */
export function restoreBoard(data: BoardsData, removed: RemovedBoard): BoardsData {
  if (findBoard(data, removed.board.id)) return data;
  const boards = [...data.boards];
  boards.splice(Math.min(removed.index, boards.length), 0, removed.board);
  return { ...data, boards };
}

export interface NewSoundInput {
  mediaId: string;
  originalFileName: string | null;
  /** Leave this out to name the sound after its file. */
  name?: string;
}

/**
 * Adds a sound to the end of a board. Its emoji and colour follow on from the board's other sounds,
 * so a new board fills up with different-looking buttons. It starts at 80% volume.
 */
export function addSound(
  data: BoardsData,
  boardId: string,
  input: NewSoundInput,
): { data: BoardsData; sound: SoundItem } | null {
  const board = findBoard(data, boardId);
  if (!board) return null;
  const position = board.sounds.length;
  const sound: SoundItem = {
    id: newId(),
    name: sanitizeSoundName(input.name ?? soundNameFromFile(input.originalFileName ?? '')),
    emoji: EMOJIS[position % EMOJIS.length],
    color: PALETTE[position % PALETTE.length],
    mediaId: input.mediaId,
    originalFileName: cleanFileName(input.originalFileName),
    volume: DEFAULT_VOLUME,
    hotkey: null,
  };
  return { data: withBoard(data, boardId, (b) => ({ ...b, sounds: [...b.sounds, sound] })), sound };
}

export type SoundChanges = Partial<Pick<SoundItem, 'name' | 'emoji' | 'color' | 'volume' | 'hotkey' | 'mediaId' | 'originalFileName'>>;

/** Changes one sound. Whatever she typed is tidied the same way as in a backup. */
export function updateSound(data: BoardsData, soundId: string, changes: SoundChanges): BoardsData {
  const found = findSound(data, soundId);
  if (!found) return data;
  const next: SoundItem = { ...found.sound };
  if (changes.name !== undefined) next.name = sanitizeSoundName(changes.name);
  if (changes.emoji !== undefined) next.emoji = sanitizeEmoji(changes.emoji);
  if (changes.color !== undefined) next.color = sanitizeColor(changes.color);
  if (changes.volume !== undefined) next.volume = sanitizeVolume(changes.volume);
  if (changes.hotkey !== undefined) next.hotkey = normalizeKeyString(changes.hotkey);
  if (changes.mediaId !== undefined) next.mediaId = changes.mediaId;
  if (changes.originalFileName !== undefined) next.originalFileName = cleanFileName(changes.originalFileName);
  return withBoard(data, found.board.id, (board) => ({
    ...board,
    sounds: board.sounds.map((sound) => (sound.id === soundId ? next : sound)),
  }));
}

export interface RemovedSound {
  sound: SoundItem;
  boardId: string;
  index: number;
}

export function removeSound(data: BoardsData, soundId: string): { data: BoardsData; removed: RemovedSound } | null {
  const found = findSound(data, soundId);
  if (!found) return null;
  return {
    data: withBoard(data, found.board.id, (board) => ({ ...board, sounds: board.sounds.filter((s) => s.id !== soundId) })),
    removed: { sound: found.sound, boardId: found.board.id, index: found.index },
  };
}

/** Puts a deleted sound back where it was. If its board is gone too, it goes on the end of the first board. */
export function restoreSound(data: BoardsData, removed: RemovedSound): BoardsData {
  if (findSound(data, removed.sound.id)) return data;
  const original = findBoard(data, removed.boardId);
  const board = original ?? data.boards[0];
  if (!board) return data;
  return withBoard(data, board.id, (b) => {
    const sounds = [...b.sounds];
    sounds.splice(original ? Math.min(removed.index, sounds.length) : sounds.length, 0, removed.sound);
    return { ...b, sounds };
  });
}

/** Moves a sound to the end of another board. */
export function moveSound(data: BoardsData, soundId: string, toBoardId: string): BoardsData {
  const found = findSound(data, soundId);
  if (!found || found.board.id === toBoardId || !findBoard(data, toBoardId)) return data;
  return {
    ...data,
    boards: data.boards.map((board) => {
      if (board.id === found.board.id) return { ...board, sounds: board.sounds.filter((s) => s.id !== soundId) };
      if (board.id === toBoardId) return { ...board, sounds: [...board.sounds, found.sound] };
      return board;
    }),
  };
}

export function setMasterVolume(data: BoardsData, volume: number): BoardsData {
  return { ...data, masterVolume: sanitizeMasterVolume(volume) };
}

export function setStopAllKey(data: BoardsData, key: string | null): BoardsData {
  return { ...data, stopAllKey: normalizeKeyString(key) };
}
