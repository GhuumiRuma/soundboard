import { useLayoutEffect, useState } from 'react';
import { openMic } from '../audio/recorder/mic';
import { createPreview } from '../audio/recorder/preview';
import { RecorderSession } from '../audio/recorder/session';
import { suspendSoundKeys } from '../keys/soundKeys';
import { getBoardStore } from '../state';
import { stopAllSounds } from '../state/actions';
import { saveRecording } from '../state/recorderSave';
import type { RecorderTarget } from '../state/ui';

/** How often the level meter and the clock are moved on. */
const TICK_MS = 50;

/**
 * Gets a recorder ready while the Record pop-up is open, and lets go of the microphone when it closes.
 * Sounds that are playing are stopped (the microphone would hear them), and sound keys are off while she is in here.
 */
export function useRecorderSession(target: RecorderTarget | null): RecorderSession | null {
  const [session, setSession] = useState<RecorderSession | null>(null);

  // A layout effect, so the recorder is in place before the pop-up is first drawn.
  useLayoutEffect(() => {
    if (!target) return;
    stopAllSounds();
    const resumeKeys = suspendSoundKeys();
    const created = new RecorderSession({
      openMic,
      createPreview,
      save: (file) => saveRecording(getBoardStore(), target, file),
    });
    setSession(created);
    void created.open();

    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      created.tick((now - last) / 1000);
      last = now;
    }, TICK_MS);

    return () => {
      window.clearInterval(timer);
      created.dispose();
      resumeKeys();
      setSession(null);
    };
  }, [target]);

  return session;
}
