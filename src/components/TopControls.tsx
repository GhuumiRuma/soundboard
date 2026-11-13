import { MasterVolume } from './MasterVolume';

/** The card above the boards on a tablet or computer. (On a phone the volume lives in the bottom bar.) */
export function TopControls() {
  return (
    <section className="ss-card top-controls" aria-label="Sound controls">
      <MasterVolume />
    </section>
  );
}
