export type AudioSessionKind = 'playback' | 'play-and-record';

/**
 * On iPhone and iPad (Safari 16.4 and later) this makes sound play even when the silent switch is on,
 * and lets the microphone work while recording. Everywhere else it quietly does nothing.
 */
export function setAudioSession(kind: AudioSessionKind): void {
  try {
    if (typeof navigator !== 'undefined' && navigator.audioSession) navigator.audioSession.type = kind;
  } catch {
    // Older browsers don't have this. Sound still plays, it just follows the silent switch.
  }
}
