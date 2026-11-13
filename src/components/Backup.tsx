import { useEffect, useId, useRef } from 'react';
import { backupMessages, lastBackupText, planReminder, snoozeUntil } from '../backup';
import { plural } from '../lib/plural';
import { soundCount } from '../model/boards';
import { getBackupController, getBoardStore, useBackupView, useBoard } from '../state';

const BUSY_TEXT = {
  saving: 'Saving your backup…',
  reading: 'Reading your backup…',
  restoring: 'Restoring your backup…',
} as const;

/** Settings: save everything to one file, or bring a saved file back. */
export function BackupSection() {
  const headingId = useId();
  const noSoundsId = useId();
  const choiceId = useId();
  const view = useBackupView();
  const sounds = useBoard((s) => soundCount(s.data));
  const lastBackupAt = useBoard((s) => s.settings.lastBackupAt);
  const controller = getBackupController();
  const restoreRef = useRef<HTMLButtonElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const choiceRef = useRef<HTMLDivElement>(null);
  const wasChoosing = useRef(false);

  const choosing = view.phase === 'choosing';
  const status = view.phase === 'idle' || view.phase === 'choosing' ? '' : BUSY_TEXT[view.phase];

  // A backup she picked but never decided on is forgotten when Settings closes.
  useEffect(() => () => controller.cancel(), [controller]);

  // Keep keyboard and screen-reader users where the action is: into the question, and back out of it.
  // The whole question comes into view first, so the buttons under the first one are not left below the edge.
  useEffect(() => {
    if (choosing) {
      wasChoosing.current = true;
      choiceRef.current?.scrollIntoView({ block: 'nearest' });
      addRef.current?.focus();
    } else if (wasChoosing.current) {
      wasChoosing.current = false;
      restoreRef.current?.focus();
    }
  }, [choosing]);

  const notIdle = view.phase !== 'idle';
  const skipped = view.phase === 'choosing' ? view.opened.skipped.length : 0;

  return (
    <section className="ss-dialog-section" aria-labelledby={headingId}>
      <h3 id={headingId}>Backup and restore</h3>
      <p>{backupMessages.intro}</p>
      <p className="ss-muted ss-field-hint">{lastBackupText(lastBackupAt, Date.now())}</p>
      <div className="ss-row">
        <button
          type="button"
          className="btn btn-accent"
          disabled={sounds === 0}
          aria-disabled={notIdle || undefined}
          aria-describedby={sounds === 0 ? noSoundsId : undefined}
          onClick={() => void controller.save()}
        >
          Save a backup
        </button>
        <button type="button" className="btn btn-outline" ref={restoreRef} aria-disabled={notIdle || undefined} onClick={() => void controller.choose()}>
          Restore from a backup
        </button>
      </div>
      {sounds === 0 && (
        <p id={noSoundsId} className="ss-muted ss-field-hint">
          You don't have any sounds to back up yet.
        </p>
      )}
      <p className="ss-muted ss-field-hint">{backupMessages.pickHint}</p>

      {view.phase === 'choosing' && (
        <div className="ss-note backup-choice" role="group" aria-labelledby={choiceId} ref={choiceRef}>
          <span aria-hidden="true">📦</span>
          <div className="ss-message-body">
            <p id={choiceId}>
              <strong>“{view.fileName}”</strong> has {plural(view.opened.boards, 'board')} and {plural(view.opened.sounds, 'sound')}.
              {skipped > 0 && ` ${plural(skipped, 'sound')} in it can't be restored.`}
            </p>
            <p>You already have sounds on this device. What should I do with these ones?</p>
            <div className="ss-row">
              <button type="button" className="btn btn-accent" ref={addRef} onClick={() => void controller.restore('add')}>
                Add them to what I have
              </button>
              <button type="button" className="btn btn-outline" onClick={() => void controller.restore('replace')}>
                Replace everything
              </button>
              <button type="button" className="btn" onClick={controller.cancel}>
                Cancel
              </button>
            </div>
            <p className="ss-muted ss-field-hint">
              Replace everything swaps your boards and sounds for the ones in the backup. You can undo that for a few seconds afterwards.
            </p>
          </div>
        </div>
      )}

      <p className="ss-visually-hidden" role="status">
        {status}
      </p>
      {status && (
        <p className="ss-muted ss-field-hint" aria-hidden="true">
          {status}
        </p>
      )}
    </section>
  );
}

/** A gentle nudge on the main screen to save a backup. It stays away until she has sounds worth keeping. */
export function BackupReminder() {
  const bodyId = useId();
  const loaded = useBoard((s) => s.loaded);
  const sounds = useBoard((s) => soundCount(s.data));
  const lastBackupAt = useBoard((s) => s.settings.lastBackupAt);
  const remindAfter = useBoard((s) => s.settings.remindAfter);
  const view = useBackupView();
  const plan = planReminder({ sounds: loaded ? sounds : 0, lastBackupAt, remindAfter, now: Date.now() });

  useEffect(() => {
    if (plan.startClockAt !== null) getBoardStore().updateSettings({ remindAfter: plan.startClockAt });
  }, [plan.startClockAt]);

  if (!plan.show) return null;
  const notIdle = view.phase !== 'idle';
  return (
    <div className="ss-note backup-reminder" role="group" aria-labelledby={bodyId}>
      <span aria-hidden="true">💾</span>
      <div className="ss-message-body" id={bodyId}>
        {backupMessages.reminder}
      </div>
      <div className="ss-message-actions">
        <button type="button" className="btn btn-accent" aria-disabled={notIdle || undefined} onClick={() => void getBackupController().save()}>
          Save a backup
        </button>
        <button type="button" className="btn btn-outline" onClick={() => getBoardStore().updateSettings({ remindAfter: snoozeUntil(Date.now()) })}>
          Not now
        </button>
      </div>
    </div>
  );
}
