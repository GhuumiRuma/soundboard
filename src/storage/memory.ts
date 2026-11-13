import { normalizeBoards } from '../model/boards';
import type { BoardsData } from '../model/types';
import { newId } from '../lib/id';
import { DEFAULT_SETTINGS, type AppSettings, type MediaRecord, type NewMedia, type StorageBackend } from './types';

/**
 * Keeps everything in memory only. It is what the app falls back to when the browser won't keep anything
 * for it (private browsing, for example), and it is what the tests use.
 */
export class MemoryStorage implements StorageBackend {
  readonly persistent: boolean;
  private boards: BoardsData | null = null;
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private readonly media = new Map<string, MediaRecord>();

  constructor(persistent = false) {
    this.persistent = persistent;
  }

  async loadBoards(): Promise<BoardsData | null> {
    return this.boards ? normalizeBoards(structuredClone(this.boards)) : null;
  }

  async saveBoards(data: BoardsData): Promise<void> {
    this.boards = structuredClone(data);
  }

  async loadSettings(): Promise<AppSettings> {
    return { ...this.settings };
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    this.settings = { ...settings };
  }

  async putMedia(files: NewMedia[]): Promise<string[]> {
    const created = Date.now();
    return files.map((file) => {
      const id = file.id ?? newId();
      this.media.set(id, { id, data: file.data.slice(0), ext: file.ext, mime: file.mime, size: file.data.byteLength, created });
      return id;
    });
  }

  async getMedia(id: string): Promise<MediaRecord | undefined> {
    const record = this.media.get(id);
    return record ? { ...record, data: record.data.slice(0) } : undefined;
  }

  async hasMedia(id: string): Promise<boolean> {
    return this.media.has(id);
  }

  async mediaIds(): Promise<string[]> {
    return [...this.media.keys()];
  }

  async mediaSizes(): Promise<Map<string, number>> {
    return new Map([...this.media].map(([id, record]) => [id, record.size]));
  }

  async deleteMedia(ids: readonly string[]): Promise<void> {
    for (const id of ids) this.media.delete(id);
  }

  async requestPersistence(): Promise<boolean> {
    return false;
  }

  close(): void {}
}
