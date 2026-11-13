interface Sized {
  readonly length: number;
  readonly numberOfChannels: number;
}

/** How much memory a decoded sound takes: every sample of every channel is a 32-bit number. */
export function decodedBytes(buffer: Sized): number {
  return buffer.length * buffer.numberOfChannels * 4;
}

/**
 * Remembers sounds that are ready to play, so a second tap is instant. When it holds more than its memory limit,
 * it lets go of the sound that was used longest ago. The newest sound is always kept, even if it is big.
 */
export class DecodedCache<T extends Sized> {
  readonly limitBytes: number;
  private readonly entries = new Map<string, { value: T; bytes: number }>();
  private total = 0;

  constructor(limitBytes: number) {
    this.limitBytes = limitBytes;
  }

  get bytes(): number {
    return this.total;
  }

  get size(): number {
    return this.entries.size;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  ids(): string[] {
    return [...this.entries.keys()];
  }

  get(id: string): T | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    // Re-adding moves it to the end, the "used most recently" end.
    this.entries.delete(id);
    this.entries.set(id, entry);
    return entry.value;
  }

  set(id: string, value: T): void {
    this.delete(id);
    const bytes = decodedBytes(value);
    this.entries.set(id, { value, bytes });
    this.total += bytes;
    for (const [oldId, entry] of this.entries) {
      if (this.total <= this.limitBytes || this.entries.size <= 1) break;
      this.entries.delete(oldId);
      this.total -= entry.bytes;
    }
  }

  delete(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    this.total -= entry.bytes;
  }

  clear(): void {
    this.entries.clear();
    this.total = 0;
  }
}
