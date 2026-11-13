import { useId } from 'react';
import { getBoardStore, useBoard } from '../state';
import { VolumeSlider } from './VolumeSlider';

/** The volume for every sound at once. It sits in the top card on a computer and in the bottom bar on a phone. */
export function MasterVolume() {
  const id = useId();
  const volume = useBoard((s) => s.data.masterVolume);
  return (
    <div className="master-volume">
      <label className="ss-field-label" htmlFor={id}>
        Master volume
      </label>
      <VolumeSlider id={id} value={volume} onChange={(v) => getBoardStore().setMasterVolume(v)} />
    </div>
  );
}
