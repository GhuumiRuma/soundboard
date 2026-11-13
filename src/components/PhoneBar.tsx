import { useRef } from 'react';
import { RECORDER_TEXT } from '../audio/recorder/messages';
import { useBarHeight } from '../hooks/useBarHeight';
import { useBoard } from '../state';
import { browseForSounds, stopAllSounds } from '../state/actions';
import { ui } from '../state/ui';
import { MasterVolume } from './MasterVolume';

/** The bar that stays at the bottom of a phone screen: a big Stop all, Add, Record, and the master volume. */
export function PhoneBar() {
  const ref = useRef<HTMLDivElement>(null);
  const adding = useBoard((s) => s.adding);
  useBarHeight(ref, true);

  return (
    <div className="phone-bar" ref={ref} role="group" aria-label="Sound controls">
      <div className="phone-bar-actions">
        <button type="button" className="btn btn-stop btn-big" aria-label="Stop all sounds" onClick={stopAllSounds}>
          Stop all
        </button>
        <button type="button" className="btn btn-outline" onClick={() => void browseForSounds()}>
          {adding ? 'Adding…' : '＋ Add'}
        </button>
        <button type="button" className="btn btn-outline" title={RECORDER_TEXT.recordHint} onClick={() => ui.openRecorder({ kind: 'new' })}>
          <span aria-hidden="true">🎙️</span> {RECORDER_TEXT.recordButton}
        </button>
      </div>
      <MasterVolume />
    </div>
  );
}
