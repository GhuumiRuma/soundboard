import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { normalizeBoards } from '../model/boards';
import type { BoardsData } from '../model/types';
import { newId } from '../lib/id';
import { DEFAULT_SETTINGS, StorageProblem, type AppSettings, type MediaRecord, type NewMedia, type StorageBackend } from './types';

const DB_NAME = 'soundboard';
const DB_VERSION = 1;

interface SoundboardDB extends DBSchema {
  /** Her boards ("boards") and device settings ("settings"). */
  state: { key: string; value: unknown };
  /** The audio files, by id. The size index lets us ask how big they are without reading them. */
  media: { key: string; value: MediaRecord; indexes: { size: number } };
}

export function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014);
}

export function normalizeSettings(raw: unknown): AppSettings {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const time = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);
  return {
    soundKeysEnabled: typeof source.soundKeysEnabled === 'boolean' ? source.soundKeysEnabled : DEFAULT_SETTINGS.soundKeysEnabled,
    lastBackupAt: time(source.lastBackupAt),
    remindAfter: time(source.remindAfter),
  };
}

/** Keeps everything in IndexedDB, which both phones and computers have inside the browser. */
export class IdbStorage implements StorageBackend {
  readonly persistent = true;
  private readonly db: IDBPDatabase<SoundboardDB>;

  private constructor(db: IDBPDatabase<SoundboardDB>) {
    this.db = db;
  }

  static async open(name: string = DB_NAME): Promise<IdbStorage> {
    const db: IDBPDatabase<SoundboardDB> = await openDB<SoundboardDB>(name, DB_VERSION, {
      upgrade(database) {
        database.createObjectStore('state');
        database.createObjectStore('media', { keyPath: 'id' }).createIndex('size', 'size');
      },
      blocking() {
        // A newer copy of the app wants to update the database. Let it.
        db.close();
      },
    });
    return new IdbStorage(db);
  }

  async loadBoards(): Promise<BoardsData | null> {
    const raw = await this.db.get('state', 'boards');
    return raw === undefined ? null : normalizeBoards(raw);
  }

  async saveBoards(data: BoardsData): Promise<void> {
    try {
      await this.db.put('state', data, 'boards');
    } catch (error) {
      throw new StorageProblem(isQuotaError(error) ? 'full' : 'failed');
    }
  }

  async loadSettings(): Promise<AppSettings> {
    return normalizeSettings(await this.db.get('state', 'settings'));
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    try {
      await this.db.put('state', settings, 'settings');
    } catch (error) {
      throw new StorageProblem(isQuotaError(error) ? 'full' : 'failed');
    }
  }

  async putMedia(files: NewMedia[]): Promise<string[]> {
    const ids: string[] = [];
    try {
      const tx = this.db.transaction('media', 'readwrite');
      const created = Date.now();
      await Promise.all([
        ...files.map((file) => {
          const id = file.id ?? newId();
          ids.push(id);
          return tx.store.put({ id, data: file.data, ext: file.ext, mime: file.mime, size: file.data.byteLength, created });
        }),
        tx.done,
      ]);
    } catch (error) {
      throw new StorageProblem(isQuotaError(error) ? 'full' : 'failed');
    }
    return ids;
  }

  getMedia(id: string): Promise<MediaRecord | undefined> {
    return this.db.get('media', id);
  }

  async hasMedia(id: string): Promise<boolean> {
    return (await this.db.getKey('media', id)) !== undefined;
  }

  mediaIds(): Promise<string[]> {
    return this.db.getAllKeys('media');
  }

  async mediaSizes(): Promise<Map<string, number>> {
    const sizes = new Map<string, number>();
    const tx = this.db.transaction('media');
    // A key cursor walks the size index and never reads the (big) audio files themselves.
    let cursor = await tx.store.index('size').openKeyCursor();
    while (cursor) {
      sizes.set(cursor.primaryKey, cursor.key);
      cursor = await cursor.continue();
    }
    await tx.done;
    return sizes;
  }

  async deleteMedia(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const tx = this.db.transaction('media', 'readwrite');
    await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
  }

  async requestPersistence(): Promise<boolean> {
    try {
      const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
      if (!storage?.persist) return false;
      if (storage.persisted && (await storage.persisted())) return true;
      return await storage.persist();
    } catch {
      return false;
    }
  }

  close(): void {
    this.db.close();
  }
}
