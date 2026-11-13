import { useId } from 'react';
import { useIsPhone, useMediaQuery } from '../hooks/useMediaQuery';
import { setThemePref, useTheme, type ThemePref } from '../state/theme';
import { ui, useUi } from '../state/ui';
import { BackupSection } from './Backup';
import { Dialog } from './Dialog';
import { SoundKeysSwitch, StopAllKeyField } from './SoundKeys';

const THEME_CHOICES: readonly { value: ThemePref; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

function ThemeSection() {
  const headingId = useId();
  const pref = useTheme((s) => s.pref);
  return (
    <section className="ss-dialog-section" aria-labelledby={headingId}>
      <h3 id={headingId}>Look</h3>
      <div className="ss-segmented" role="radiogroup" aria-labelledby={headingId}>
        {THEME_CHOICES.map((choice) => (
          <label key={choice.value}>
            <input type="radio" name="theme" value={choice.value} checked={pref === choice.value} onChange={() => setThemePref(choice.value)} />
            <span>{choice.label}</span>
          </label>
        ))}
      </div>
      <p className="ss-muted ss-field-hint">System follows your device, so it switches to dark at night if your device does.</p>
    </section>
  );
}

function SoundKeysSection() {
  const headingId = useId();
  const touch = useMediaQuery('(pointer: coarse)');
  return (
    <section className="ss-dialog-section" aria-labelledby={headingId}>
      <h3 id={headingId}>Sound keys</h3>
      <SoundKeysSwitch />
      <StopAllKeyField />
      {touch && <p className="ss-muted ss-field-hint">Sound keys need a keyboard connected to this device. Without one, just tap the buttons.</p>}
    </section>
  );
}

function AboutSection() {
  const headingId = useId();
  return (
    <section className="ss-dialog-section" aria-labelledby={headingId}>
      <h3 id={headingId}>About</h3>
      <p>Everything stays on this device. There is no account, no cloud and no tracking.</p>
      <p className="ss-muted ss-field-hint">
        Soundboard version {__APP_VERSION__} (build {__BUILD_ID__})
      </p>
    </section>
  );
}

/** Settings: how it looks, sound keys, backups, installing, and the version. */
export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const isPhone = useIsPhone();
  return (
    <Dialog open={open} title="Settings" onClose={ui.closeSettings} sheet={isPhone}>
      <ThemeSection />
      <SoundKeysSection />
      <BackupSection />
      <AboutSection />
    </Dialog>
  );
}
