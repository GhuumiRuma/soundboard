import type { Preview } from '../audio/recorder/preview';

/** A preview that makes no sound, so a test can see what was played and decide when it ends. */
export class FakePreview implements Preview {
  played: { samples: Float32Array; rate: number }[] = [];
  /** Every "it has ended" callback it was given, in order, so a test can fire an old one late. */
  readonly ends: (() => void)[] = [];
  stops = 0;
  canPlay = true;
  private ended: (() => void) | null = null;

  play(samples: Float32Array, rate: number, onEnded: () => void): boolean {
    if (!this.canPlay) return false;
    this.played.push({ samples, rate });
    this.ends.push(onEnded);
    this.ended = onEnded;
    return true;
  }

  stop(): void {
    this.stops += 1;
    this.finish();
  }

  /** It played to the end by itself. */
  finish(): void {
    const ended = this.ended;
    this.ended = null;
    ended?.();
  }
}
