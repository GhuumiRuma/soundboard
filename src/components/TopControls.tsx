import { MasterVolume } from './MasterVolume';
import { SoundKeysSwitch, StopAllKeyField } from './SoundKeys';

/** The card above the boards on a tablet or computer. (On a phone the volume lives in the bottom bar.) */
export function TopControls() {
  return (
    <section className="ss-card top-controls" aria-label="Sound controls">
      <SoundKeysSwitch />
      <div className="top-controls-row">
        <MasterVolume />
        <StopAllKeyField inline />
      </div>
    </section>
  );
}
