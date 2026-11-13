import { useEffect, useId, useRef, useState } from 'react';
import { detectOs, isIOSSafari, isStandalone } from '../lib/device';
import { soundCount } from '../model/boards';
import { getPlatform } from '../platform';
import { installAdvice, type InstallAdvice } from '../pwa/advice';
import { installMessages, installNote, installSteps, updateMessages } from '../pwa/messages';
import { pwa, usePwa } from '../pwa/state';
import { getBoardStore, useBoard } from '../state';

/** Where the Windows and Mac apps live. Their sound keys work while a game is in front. */
const DESKTOP_APP_URL = 'https://github.com/GhuumiRuma/soundboard/releases/tag/desktop-latest';

/** How long to wait for a new version to take over before telling her it didn't work. */
const UPDATE_PATIENCE_MS = 5000;

/** What to say about installing on this device, worked out from where Soundboard is open and what has happened so far. */
function useInstallAdvice(): InstallAdvice {
  const canPrompt = usePwa((s) => s.installOffer !== null);
  const installed = usePwa((s) => s.installed);
  const dismissed = usePwa((s) => s.hintDismissed);
  return installAdvice({
    os: detectOs(),
    iosSafari: isIOSSafari(),
    standalone: isStandalone(),
    nativeApp: __NATIVE_BUILD__ || getPlatform().isNativeApp,
    canPrompt,
    installed,
    dismissed,
  });
}

/** Shows the browser's install question. Saying no there counts as "No thanks", so she isn't asked again here. */
async function install(): Promise<void> {
  if ((await pwa.promptInstall()) === 'dismissed') pwa.dismissHint();
}

/** A new version of Soundboard has been downloaded. It only takes over when she says so. */
export function UpdateNotice() {
  const ready = usePwa((s) => s.updateReady && !s.updateLater);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!ready) return null;

  const update = () => {
    if (busy) return;
    setBusy(true);
    const giveUp = () => {
      setBusy(false);
      getBoardStore().addProblem(updateMessages.stuck);
    };
    // The page reloads by itself when the new version takes over. If it is still here after a few seconds, something got stuck.
    timer.current = window.setTimeout(giveUp, UPDATE_PATIENCE_MS);
    pwa.applyUpdate().catch(() => {
      window.clearTimeout(timer.current);
      giveUp();
    });
  };

  return (
    <div className="ss-note pwa-note" role="status">
      <span aria-hidden="true">✨</span>
      <div className="ss-message-body">
        <p>
          {updateMessages.ready} {updateMessages.stays}
        </p>
      </div>
      <div className="ss-message-actions">
        <button type="button" className="btn btn-accent" aria-disabled={busy || undefined} onClick={update}>
          {busy ? updateMessages.updating : updateMessages.update}
        </button>
        <button type="button" className="btn btn-outline" aria-disabled={busy || undefined} onClick={() => !busy && pwa.updateLater()}>
          {updateMessages.later}
        </button>
      </div>
    </div>
  );
}

/** Suggests putting Soundboard on the Home Screen or installing it. It only shows where that is easy to miss. */
export function InstallNotice() {
  const advice = useInstallAdvice();
  const hasSounds = useBoard((s) => soundCount(s.data) > 0);
  const paragraphs = advice.note && advice.help ? installNote(advice.help, hasSounds) : [];
  if (paragraphs.length === 0) return null;

  const oneTap = advice.help === 'button';
  return (
    <div className="ss-note pwa-note" role="group" aria-label={installMessages.installSoundboard}>
      <span aria-hidden="true">📲</span>
      <div className="ss-message-body">
        {paragraphs.map((text, index) => (
          <p key={text} className={index === 0 ? undefined : 'ss-muted ss-field-hint'}>
            {text}
          </p>
        ))}
      </div>
      <div className="ss-message-actions">
        {oneTap ? (
          <>
            <button type="button" className="btn btn-accent" onClick={() => void install()}>
              {installMessages.install}
            </button>
            <button type="button" className="btn btn-outline" onClick={pwa.dismissHint}>
              {installMessages.noThanks}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-outline" onClick={pwa.dismissHint}>
            {installMessages.gotIt}
          </button>
        )}
      </div>
    </div>
  );
}

/** In Settings: how to put Soundboard on this device. It stays away inside the Android and desktop apps. */
export function InstallSection() {
  const headingId = useId();
  const advice = useInstallAdvice();
  if (advice.help === null) return null;

  const os = detectOs();
  const steps = advice.help === 'installed' || advice.help === 'button' ? [] : installSteps[advice.help];
  return (
    <section className="ss-dialog-section" aria-labelledby={headingId}>
      <h3 id={headingId}>{installMessages.heading}</h3>
      {advice.help === 'installed' && <p>{installMessages.installed}</p>}
      {advice.help === 'button' && (
        <>
          <p>{installMessages.offer}</p>
          <div className="ss-row">
            <button type="button" className="btn btn-accent" onClick={() => void install()}>
              {installMessages.installSoundboard}
            </button>
          </div>
        </>
      )}
      {steps.map((text, index) => (
        <p key={text} className={index === 0 ? undefined : 'ss-muted ss-field-hint'}>
          {text}
        </p>
      ))}
      {(os === 'windows' || os === 'mac') && (
        <>
          <p className="ss-muted ss-field-hint">{installMessages.desktopApp}</p>
          <div className="ss-row">
            <a className="btn btn-outline" href={DESKTOP_APP_URL} target="_blank" rel="noopener noreferrer">
              {installMessages.desktopAppLink}
              <span className="ss-visually-hidden"> (opens in a new tab)</span>
            </a>
          </div>
        </>
      )}
    </section>
  );
}
