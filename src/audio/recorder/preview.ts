import { getRecordingContext } from './context';

/** Plays back what has been recorded, so she can hear it before saving. Only one plays at a time. */
export interface Preview {
  /** Starts playing. `onEnded` is called once it has finished (or been stopped). False when this device can't play it. */
  play(samples: Float32Array, rate: number, onEnded: () => void): boolean;
  /** Stops it now. */
  stop(): void;
}

/** A preview that plays through the app's one audio context, at full volume (not the master volume). */
export const createPreview = (): Preview => {
  let stopCurrent: (() => void) | null = null;

  const stop = (): void => {
    const stopping = stopCurrent;
    stopCurrent = null;
    stopping?.();
  };

  const play = (samples: Float32Array, rate: number, onEnded: () => void): boolean => {
    stop();
    const context = getRecordingContext();
    if (!context || samples.length === 0) return false;

    let source: AudioBufferSourceNode;
    try {
      const buffer = context.createBuffer(1, samples.length, rate);
      buffer.getChannelData(0).set(samples);
      source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
    } catch {
      return false;
    }

    let over = false;
    const finish = (): void => {
      if (over) return;
      over = true;
      if (stopCurrent === halt) stopCurrent = null;
      try {
        source.disconnect();
      } catch {
        // Already disconnected.
      }
      onEnded();
    };
    const halt = (): void => {
      try {
        source.stop();
      } catch {
        // It hadn't started, or has finished.
      }
      finish();
    };

    source.onended = finish;
    stopCurrent = halt;
    try {
      source.start();
    } catch {
      stopCurrent = null;
      return false;
    }
    return true;
  };

  return { play, stop };
};
