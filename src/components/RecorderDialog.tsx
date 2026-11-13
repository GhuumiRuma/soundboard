import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { RECORDER_TEXT, keepingText, recordingTime, replacingText, type Notice } from '../audio/recorder/messages';
import { MAX_RECORDING_MS, seconds, stamp } from '../audio/recorder/rules';
import type { RecorderSession, RecorderState } from '../audio/recorder/session';
import { useIsPhone } from '../hooks/useMediaQuery';
import { useRecorderSession } from '../hooks/useRecorderSession';
import { saveNotice, type SaveNotice } from '../lib/saveMessages';
import { findSound } from '../model/boards';
import { MAX_NAME_LENGTH } from '../model/rules';
import { getPlatform } from '../platform';
import { useBoard } from '../state';
import { ui, useUi, type RecorderTarget } from '../state/ui';
import { Dialog } from './Dialog';
import { Waveform } from './Waveform';

/** The Record pop-up. It is always on the page, but it only opens (and only uses the microphone) while she is recording. */
export function RecorderDialog() {
  const target = useUi((s) => s.recorder);
  const session = useRecorderSession(target);
  const isPhone = useIsPhone();

  /** Closing asks first when a recording of a second or more would be lost. */
  const requestClose = () => {
    if (!session) {
      ui.closeRecorder();
      return;
    }
    // Escape, or a tap outside, while the question is showing means "keep it".
    if (session.getState().confirm !== null) session.keepIt();
    else if (session.requestClose()) ui.closeRecorder();
  };

  return (
    <Dialog open={target !== null} title={RECORDER_TEXT.title} sheet={isPhone} className="recorder-dialog" onClose={requestClose}>
      {session && target && <RecorderBody session={session} target={target} onRequestClose={requestClose} />}
    </Dialog>
  );
}

interface BodyProps {
  session: RecorderSession;
  target: RecorderTarget;
  onRequestClose: () => void;
}

function RecorderBody({ session, target, onRequestClose }: BodyProps) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const nameId = useId();
  const startId = useId();
  const endId = useId();
  const recordRef = useRef<HTMLButtonElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const againRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const lastPhase = useRef(state.phase);
  const [copyNotice, setCopyNotice] = useState<SaveNotice | null>(null);
  const replacingName = useBoard((s) => (target.kind === 'replace' ? (findSound(s.data, target.soundId)?.sound.name ?? '') : null));

  const { phase, mic, confirm } = state;
  const recording = phase === 'recording';
  const capturing = phase === 'ready' || recording;
  const saving = phase === 'saving';
  const readyToRecord = phase === 'ready' && mic.status === 'open';

  // Once she has saved it there is nothing left to do here.
  useEffect(() => {
    if (phase === 'done') ui.closeRecorder();
  }, [phase]);

  // The cursor goes where she will want it next, so the keyboard works from the first moment.
  useEffect(() => {
    if (readyToRecord) recordRef.current?.focus({ preventScroll: true });
  }, [readyToRecord]);

  useEffect(() => {
    const was = lastPhase.current;
    lastPhase.current = phase;
    if (phase !== 'review') return;
    // After a save that didn't work, the Save button is where she will want to try again.
    const next = was === 'saving' ? saveRef.current : (playRef.current ?? againRef.current);
    next?.focus({ preventScroll: true });
  }, [phase]);

  // When "Throw this recording away?" appears the cursor moves to it, and goes back to where it was when she answers.
  useEffect(() => {
    if (confirm !== null) {
      keepRef.current?.focus({ preventScroll: true });
      return;
    }
    const back = lastFocused.current;
    if (back?.isConnected && !back.closest('[inert]')) back.focus({ preventScroll: true });
  }, [confirm]);

  // The note about a copy she saved belongs to the recording in front of her.
  useEffect(() => {
    if (phase !== 'review') setCopyNotice(null);
  }, [phase]);

  const saveCopy = async () => {
    const file = session.renderFile();
    if (!file) return;
    const outcome = await getPlatform().saveFile({
      fileName: file.fileName,
      mimeType: 'audio/wav',
      data: new Blob([file.bytes], { type: 'audio/wav' }),
      title: file.name,
    });
    setCopyNotice(saveNotice(outcome, 'your recording'));
  };

  const discard = () => onRequestClose();

  return (
    <div
      className="recorder"
      onFocusCapture={(e) => {
        const element = e.target as HTMLElement;
        if (!element.closest('.recorder-confirm')) lastFocused.current = element;
      }}
    >
      {confirm !== null && (
        <div className="ss-warning recorder-confirm">
          <span aria-hidden="true">⚠️</span>
          <div className="ss-message-body">
            <p role="alert">
              <strong>{RECORDER_TEXT.confirm}</strong>
            </p>
            <div className="recorder-confirm-actions">
              <button ref={keepRef} type="button" className="btn btn-accent" onClick={() => session.keepIt()}>
                {recording ? RECORDER_TEXT.keepRecording : RECORDER_TEXT.keepIt}
              </button>
              <button
                type="button"
                className="btn btn-outline btn-danger-text"
                onClick={() => {
                  if (session.throwAway()) ui.closeRecorder();
                }}
              >
                {RECORDER_TEXT.throwAway}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="recorder-controls" inert={confirm !== null}>
        {capturing ? (
          <>
            <MicRow state={state} onRetry={() => void session.retry()} />
            <div className="recorder-record-row">
              <button
                ref={recordRef}
                type="button"
                className="btn btn-stop btn-big recorder-record"
                disabled={!recording && !readyToRecord}
                onClick={() => (recording ? void session.stop() : session.record())}
              >
                <span aria-hidden="true">{recording ? '■' : '●'}</span> {recording ? RECORDER_TEXT.stop : RECORDER_TEXT.record}
              </button>
              <span className="recorder-time" role="timer">
                {recording ? recordingTime(state.elapsedMs, MAX_RECORDING_MS) : RECORDER_TEXT.readyTime}
              </span>
            </div>
            {state.notice && <Message notice={state.notice} />}
            {target.kind === 'replace' && !recording && <p className="ss-field-hint">{replacingText(replacingName ?? '')}</p>}
          </>
        ) : (
          <>
            {state.notice && <Message notice={state.notice} />}

            {!state.silent && (
              <>
                <div className="recorder-wave">
                  <Waveform
                    bars={state.bars}
                    lengthMs={state.lengthMs}
                    startMs={state.startMs}
                    endMs={state.endMs}
                    trimmed={state.trimmed}
                    label={RECORDER_TEXT.waveform}
                  />
                </div>
                <div className="recorder-handles">
                  <TrimSlider
                    id={startId}
                    label={RECORDER_TEXT.start}
                    ms={state.startMs}
                    lengthMs={state.lengthMs}
                    isStart
                    disabled={saving}
                    onChange={(ms) => session.setStart(ms)}
                  />
                  <TrimSlider
                    id={endId}
                    label={RECORDER_TEXT.end}
                    ms={state.endMs}
                    lengthMs={state.lengthMs}
                    disabled={saving}
                    onChange={(ms) => session.setEnd(ms)}
                  />
                </div>
                <div className="recorder-play-row">
                  <button ref={playRef} type="button" className="btn" disabled={!state.canSave || saving} onClick={() => session.togglePreview()}>
                    <span aria-hidden="true">{state.previewing ? '■' : '▶'}</span> {state.previewing ? RECORDER_TEXT.stopPlaying : RECORDER_TEXT.play}
                  </button>
                  <span className="ss-field-hint">{keepingText(state.keptMs, state.lengthMs)}</span>
                </div>
              </>
            )}

            {!state.silent && target.kind === 'new' && (
              <div className="ss-field">
                <label className="ss-field-label" htmlFor={nameId}>
                  {RECORDER_TEXT.name}
                </label>
                <input
                  id={nameId}
                  type="text"
                  className="ss-input"
                  value={state.name}
                  maxLength={MAX_NAME_LENGTH}
                  autoComplete="off"
                  disabled={saving}
                  onChange={(e) => session.setName(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void session.save();
                    }
                  }}
                />
              </div>
            )}
            {!state.silent && target.kind === 'replace' && <p className="ss-field-hint">{replacingText(replacingName ?? '')}</p>}

            <div className="recorder-actions">
              {!state.silent && (
                <button
                  ref={saveRef}
                  type="button"
                  className="btn btn-accent btn-big"
                  disabled={!state.canSave || saving}
                  aria-busy={saving}
                  onClick={() => void session.save()}
                >
                  {saving ? RECORDER_TEXT.saving : RECORDER_TEXT.save}
                </button>
              )}
              <button ref={againRef} type="button" className="btn btn-outline" disabled={saving} onClick={() => session.recordAgain()}>
                {RECORDER_TEXT.recordAgain}
              </button>
              <button type="button" className="btn btn-outline" disabled={saving} onClick={discard}>
                {RECORDER_TEXT.discard}
              </button>
            </div>

            {!state.silent && (
              <div className="recorder-copy">
                <button type="button" className="btn btn-outline" disabled={!state.canSave || saving} onClick={() => void saveCopy()}>
                  {RECORDER_TEXT.saveCopy}
                </button>
                <p className={copyNotice?.kind === 'problem' ? 'recorder-copy-status is-problem' : 'recorder-copy-status'} role="status">
                  {copyNotice?.text}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Which microphone is in use and how loud it is, or why it can't be used. */
function MicRow({ state, onRetry }: { state: RecorderState; onRetry: () => void }) {
  const { mic, level } = state;

  if (mic.status === 'opening') {
    return (
      <p className="recorder-opening" role="status">
        {RECORDER_TEXT.opening}
      </p>
    );
  }

  if (mic.status === 'problem') {
    return (
      <div className="ss-problem" role="alert">
        <span aria-hidden="true">⚠️</span>
        <div className="ss-message-body">{mic.text}</div>
        {mic.canRetry && (
          <div className="ss-message-actions">
            <button type="button" className="btn btn-outline" onClick={onRetry}>
              {RECORDER_TEXT.retry}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="recorder-mic">
      <div className="recorder-mic-name">
        <span aria-hidden="true">🎙️</span>
        <span className="recorder-mic-label">{mic.label || RECORDER_TEXT.microphone}</span>
      </div>
      <div className="recorder-meter" role="meter" aria-label={RECORDER_TEXT.meterName} aria-valuemin={0} aria-valuemax={100} aria-valuenow={level}>
        <div className="recorder-meter-fill" style={{ '--level': `${level}%` } as CSSProperties} />
      </div>
    </div>
  );
}

/** Something the recorder wants her to know: a tip (hint) or something that went wrong (problem). */
function Message({ notice }: { notice: Notice }) {
  if (notice.kind === 'problem') {
    return (
      <div className="ss-problem" role="alert">
        <span aria-hidden="true">⚠️</span>
        <div className="ss-message-body">{notice.text}</div>
      </div>
    );
  }
  return (
    <div className="ss-note" role="status">
      <span aria-hidden="true">💡</span>
      <div className="ss-message-body">{notice.text}</div>
    </div>
  );
}

interface TrimSliderProps {
  id: string;
  label: string;
  ms: number;
  lengthMs: number;
  /** The Start slider is coloured the other way round: what comes after it is what is kept. */
  isStart?: boolean;
  disabled: boolean;
  onChange: (ms: number) => void;
}

/** How far a key moves a handle, in milliseconds. The browser's own step is a hundredth of the whole recording. */
const KEY_STEPS_MS: Partial<Record<string, number>> = {
  ArrowRight: 50,
  ArrowUp: 50,
  ArrowLeft: -50,
  ArrowDown: -50,
  PageUp: 500,
  PageDown: -500,
};

/** Start or End: slide to choose which part of the recording is kept. The picture above shows the same part. */
function TrimSlider({ id, label, ms, lengthMs, isStart = false, disabled, onChange }: TrimSliderProps) {
  const percent = lengthMs > 0 ? (ms / lengthMs) * 100 : 0;
  return (
    <div className="recorder-handle">
      <div className="recorder-handle-head">
        <label className="ss-field-label" htmlFor={id}>
          {label}
        </label>
        <span className="recorder-stamp" aria-hidden="true">
          {stamp(ms)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        className={isStart ? 'ss-range is-start' : 'ss-range'}
        min={0}
        max={lengthMs}
        step="any"
        value={ms}
        disabled={disabled}
        style={{ '--fill': `${percent}%` } as CSSProperties}
        aria-valuetext={`${seconds(ms)} seconds`}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        onKeyDown={(e) => {
          const step = KEY_STEPS_MS[e.key];
          if (step === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
          e.preventDefault();
          onChange(Math.min(lengthMs, Math.max(0, ms + step)));
        }}
      />
    </div>
  );
}
