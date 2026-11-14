import { useLayoutEffect, useState } from 'react';
import { decodeFile, probeDuration } from '../audio/clip/decode';
import { ClipSession } from '../audio/clip/session';
import { createPreview } from '../audio/recorder/preview';
import { suspendSoundKeys } from '../keys/soundKeys';
import { getBoardStore } from '../state';
import { stopAllSounds } from '../state/actions';
import { saveRecording } from '../state/recorderSave';

/**
 * Gets the clipper ready while the Clip a sound pop-up is open, and lets go of the file when it closes.
 * Sounds that are playing are stopped (they would be mixed into what she is listening for), and sound keys are off
 * while she is in here, the same as when she records.
 */
export function useClipSession(open: boolean): ClipSession | null {
  const [session, setSession] = useState<ClipSession | null>(null);

  // A layout effect, so the clipper is in place before the pop-up is first drawn.
  useLayoutEffect(() => {
    if (!open) return;
    stopAllSounds();
    const resumeKeys = suspendSoundKeys();
    const created = new ClipSession({
      probe: probeDuration,
      decode: decodeFile,
      createPreview,
      save: (file) => saveRecording(getBoardStore(), { kind: 'new' }, file),
    });
    setSession(created);

    return () => {
      created.dispose();
      resumeKeys();
      setSession(null);
    };
  }, [open]);

  return session;
}
