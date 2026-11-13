import type { BoardsData } from '../model/types';
import type { AudioExt } from './import';

/** One stored audio file. The bytes are kept as an ArrayBuffer (not a Blob) because iPhones can lose stored Blobs. */
export interface MediaRecord {
  id: string;
  data: ArrayBuffer;
  ext: AudioExt;
  mime: string;
  /** How many bytes the file is. It can be looked up without reading the file itself. */
  size: number;
  created: number;
}

export interface NewMedia {
  /** Leave this out to get a new id. A restored backup passes its own. */
  id?: string;
  data: ArrayBuffer;
  ext: AudioExt;
  mime: string;
}

/** Things about this device that a backup doesn't keep. (The look, Dark or Light, is kept by the theme.) */
export interface AppSettings {
  /** The "Sound keys" switch. */
  soundKeysEnabled: boolean;
  /** When she last saved a backup file (a time in milliseconds), or null if she never has. */
  lastBackupAt: number | null;
  /** Don't remind her about a backup before this time (milliseconds), or null. */
  remindAfter: number | null;
}

export const DEFAULT_SETTINGS: AppSettings = { soundKeysEnabled: true, lastBackupAt: null, remindAfter: null };

export const storageMessages = {
  full: "There isn't enough room on this device to keep that sound. Delete a sound you don't need and try again.",
  failed: "Couldn't save that on this device. Try again.",
  unavailable:
    "This browser won't let me keep your sounds (it may be in private browsing), so they'll be gone when you close this page.",
} as const;

/** Something couldn't be kept on the device. The message is safe to show to her as it is. */
export class StorageProblem extends Error {
  readonly kind: 'full' | 'failed';
  constructor(kind: 'full' | 'failed') {
    super(storageMessages[kind]);
    this.name = 'StorageProblem';
    this.kind = kind;
  }
}

/** Where her boards, settings and audio files are kept on this device. */
export interface StorageBackend {
  /** False when nothing will survive closing the page (the browser wouldn't give us room). */
  readonly persistent: boolean;
  loadBoards(): Promise<BoardsData | null>;
  saveBoards(data: BoardsData): Promise<void>;
  loadSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  /** Keeps audio files. Throws StorageProblem when there's no room. Returns the ids they are kept under. */
  putMedia(files: NewMedia[]): Promise<string[]>;
  getMedia(id: string): Promise<MediaRecord | undefined>;
  hasMedia(id: string): Promise<boolean>;
  mediaIds(): Promise<string[]>;
  /** How big each stored file is, by id, without reading the files. */
  mediaSizes(): Promise<Map<string, number>>;
  deleteMedia(ids: readonly string[]): Promise<void>;
  /** Asks the browser not to clear these sounds when it's short of room. Returns whether it agreed. */
  requestPersistence(): Promise<boolean>;
  close(): void;
}
