import { getEngine } from '../index';

/**
 * The one audio context the whole app shares, as the browser's real AudioContext. The sound engine only needs a few
 * parts of it; the recorder also needs the microphone and sound buffers.
 */
export const getRecordingContext = (): AudioContext | null => {
  const context = getEngine().context();
  return context ? (context as unknown as AudioContext) : null;
};
