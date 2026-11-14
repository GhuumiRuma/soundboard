import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { CLIP_TEXT, keepingClipText, openingText, placedText, placeText } from '../audio/clip/messages';
import { keyStepsFor } from '../audio/clip/rules';
import type { ClipSession, ClipState } from '../audio/clip/session';
import { RECORDER_TEXT } from '../audio/recorder/messages';
import { useClipSession } from '../hooks/useClipSession';
import { useIsPhone } from '../hooks/useMediaQuery';
import { usePageDrop } from '../hooks/usePageDrop';
import { pickClipFile } from '../lib/pickFiles';
import { saveNotice, type SaveNotice } from '../lib/saveMessages';
import { MAX_NAME_LENGTH } from '../model/rules';
import { getPlatform } from '../platform';
import { ui, useUi } from '../state/ui';
import { Dialog } from './Dialog';
import { NoticeBox } from './NoticeBox';
import { TrimSlider } from './TrimSlider';
import { Waveform } from './Waveform';

/** The Clip a sound pop-up. It is always on the page, but it only opens, and only holds a file, while she is clipping. */
export function ClipDialog() {
  const open = useUi((s) => s.clipper);
  const session = useClipSession(open);
  const isPhone = useIsPhone();

  // Nothing is saved until she presses Save, so closing never loses anything. Only a save that is under way holds it open.
  const requestClose = () => {
    if (!session || session.requestClose()) ui.closeClipper();
  };

  return (
    <Dialog open={open} title={CLIP_TEXT.title} sheet={isPhone} className="clip-dialog" onClose={requestClose}>
      {session && <ClipBody session={session} isPhone={isPhone} />}
    </Dialog>
  );
}

interface BodyProps {
  session: ClipSession;
  isPhone: boolean;
}

function ClipBody({ session, isPhone }: BodyProps) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const { phase } = state;

  // Once she has saved it there is nothing left to do here.
  useEffect(() => {
    if (phase === 'done') ui.closeClipper();
  }, [phase]);

  if (phase === 'choose') return <ChooseFile session={session} problem={state.problem} isPhone={isPhone} />;
  if (phase === 'loading') return <Opening session={session} fileName={state.fileName} />;
  return <Review session={session} state={state} />;
}

/** The first screen: choose a file, or drop one here. A file that couldn't be opened brings her back with the reason. */
function ChooseFile({ session, problem, isPhone }: { session: ClipSession; problem: string | null; isPhone: boolean }) {
  const chooseRef = useRef<HTMLButtonElement>(null);

  const open = (file: File | null | undefined) => {
    if (file) void session.load(file, file.name);
  };
  // Only while this screen is showing: a file dropped later, with a clip open, is not meant to replace it.
  const dragOver = usePageDrop(true, (files) => open(files[0]));

  useEffect(() => {
    chooseRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="clip-choose">
      {problem && (
        <div className="ss-problem" role="alert">
          <span aria-hidden="true">⚠️</span>
          <div className="ss-message-body">{problem}</div>
        </div>
      )}
      <div className={`ss-dropzone clip-dropzone${dragOver ? ' drag-over' : ''}`}>
        <div className="ss-dropzone-icon" aria-hidden="true">
          ✂️
        </div>
        <div className="ss-dropzone-text">
          <strong>{CLIP_TEXT.intro}</strong>
          <span className="ss-dropzone-hint">{CLIP_TEXT.limits}</span>
        </div>
        <div className="ss-dropzone-actions">
          <button ref={chooseRef} type="button" className="btn btn-accent btn-big" onClick={() => void pickClipFile().then(open)}>
            {CLIP_TEXT.choose}
          </button>
        </div>
        {!isPhone && <span className="ss-dropzone-hint">{CLIP_TEXT.drop}</span>}
      </div>
      <p className="ss-field-hint">{CLIP_TEXT.rights}</p>
    </div>
  );
}

/** While a file is being read. A long video can take a few seconds, so there is a way out. */
function Opening({ session, fileName }: { session: ClipSession; fileName: string }) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="clip-opening">
      <p className="recorder-opening" role="status">
        {openingText(fileName)}
      </p>
      <div className="clip-progress" aria-hidden="true">
        <div className="clip-progress-bar" />
      </div>
      <div>
        <button ref={cancelRef} type="button" className="btn btn-outline" onClick={() => session.cancel()}>
          {CLIP_TEXT.cancel}
        </button>
      </div>
    </div>
  );
}

/** A web address the player can open the file from, for as long as the file is on screen. */
function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) return;
    const made = URL.createObjectURL(blob);
    setUrl(made);
    return () => {
      URL.revokeObjectURL(made);
      setUrl(null);
    };
  }, [blob]);

  return url;
}

/** What the player can do with the file. A sound has no picture, so it only needs a slim bar. */
type PlayerStatus = 'opening' | 'video' | 'sound' | 'failed';

function Review({ session, state }: { session: ClipSession; state: ClipState }) {
  const startId = useId();
  const endId = useId();
  const nameId = useId();
  const playerRef = useRef<HTMLVideoElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const lastPhase = useRef(state.phase);
  const [player, setPlayer] = useState<PlayerStatus>('opening');
  const [placed, setPlaced] = useState('');
  const [copyNotice, setCopyNotice] = useState<SaveNotice | null>(null);
  const url = useObjectUrl(state.source);

  const { phase } = state;
  const saving = phase === 'saving';
  const playerReady = player === 'video' || player === 'sound';
  const span = state.viewEndMs - state.viewStartMs;
  const { stepMs, pageMs } = keyStepsFor(span);

  // The cursor goes where she will want it next, so the keyboard works from the first moment.
  useEffect(() => {
    const was = lastPhase.current;
    lastPhase.current = phase;
    if (phase !== 'review') return;
    // After a save that didn't work, the Save button is where she will want to try again.
    (was === 'saving' ? saveRef.current : playRef.current)?.focus({ preventScroll: true });
  }, [phase]);

  // If the player she was on goes away (the browser can't play this file), the cursor moves on instead of getting lost.
  useEffect(() => {
    if (player !== 'failed') return;
    const active = document.activeElement;
    if (!active || active === document.body || active.tagName === 'DIALOG') playRef.current?.focus({ preventScroll: true });
  }, [player]);

  useEffect(() => {
    if (saving) playerRef.current?.pause();
  }, [saving]);

  // The note about a copy she saved belongs to the clip in front of her.
  useEffect(() => {
    if (phase !== 'review') setCopyNotice(null);
  }, [phase]);

  const markHere = (which: 'start' | 'end') => {
    const video = playerRef.current;
    if (!video) return;
    const ms = video.currentTime * 1000;
    if (which === 'start') session.startHere(ms);
    else session.endHere(ms);
    const now = session.getState();
    setPlaced(placedText(which, which === 'start' ? now.startMs : now.endMs));
  };

  // The file's own player and the preview of the clip are two sounds. Only one at a time.
  const togglePreview = () => {
    playerRef.current?.pause();
    session.togglePreview();
  };

  const chooseAnother = async () => {
    const file = await pickClipFile();
    if (file) void session.load(file, file.name);
  };

  const saveCopy = async () => {
    const file = session.renderFile();
    if (!file) return;
    const outcome = await getPlatform().saveFile({
      fileName: file.fileName,
      mimeType: 'audio/wav',
      data: new Blob([file.bytes], { type: 'audio/wav' }),
      title: file.name,
    });
    setCopyNotice(saveNotice(outcome, 'your clip'));
  };

  return (
    <div className="recorder clip">
      {state.notice && <NoticeBox notice={state.notice} />}

      <div className="clip-source">
        {player === 'failed' ? (
          <p className="ss-field-hint">{CLIP_TEXT.playerFailed}</p>
        ) : (
          <>
            {url && (
              <video
                ref={playerRef}
                className={player === 'sound' ? 'clip-player is-sound' : 'clip-player'}
                src={url}
                controls
                playsInline
                preload="metadata"
                aria-label={CLIP_TEXT.player}
                onLoadedMetadata={(e) => setPlayer(e.currentTarget.videoWidth === 0 ? 'sound' : 'video')}
                onError={() => setPlayer('failed')}
                onPlay={() => session.stopPreview()}
              />
            )}
            <div className="clip-here" role="group" aria-label={CLIP_TEXT.setFromPlayer}>
              <button type="button" className="btn btn-outline" disabled={!playerReady || saving} onClick={() => markHere('start')}>
                {CLIP_TEXT.startHere}
              </button>
              <button type="button" className="btn btn-outline" disabled={!playerReady || saving} onClick={() => markHere('end')}>
                {CLIP_TEXT.endHere}
              </button>
            </div>
            <p className="ss-visually-hidden" role="status">
              {placed}
            </p>
          </>
        )}
      </div>

      <div className="recorder-wave">
        <Waveform
          bars={state.bars}
          lengthMs={span}
          startMs={state.startMs - state.viewStartMs}
          endMs={state.endMs - state.viewStartMs}
          trimmed={state.startMs > state.viewStartMs || state.endMs < state.viewEndMs}
          label={CLIP_TEXT.waveform}
        />
      </div>
      <div className="recorder-handles">
        <TrimSlider
          id={startId}
          label={RECORDER_TEXT.start}
          ms={state.startMs}
          fromMs={state.viewStartMs}
          toMs={state.viewEndMs}
          stepMs={stepMs}
          pageMs={pageMs}
          isStart
          disabled={saving}
          valueText={placeText}
          onChange={(ms) => session.setStart(ms)}
        />
        <TrimSlider
          id={endId}
          label={RECORDER_TEXT.end}
          ms={state.endMs}
          fromMs={state.viewStartMs}
          toMs={state.viewEndMs}
          stepMs={stepMs}
          pageMs={pageMs}
          disabled={saving}
          valueText={placeText}
          onChange={(ms) => session.setEnd(ms)}
        />
      </div>
      <div className="recorder-play-row">
        <button ref={playRef} type="button" className="btn" disabled={saving} onClick={togglePreview}>
          <span aria-hidden="true">{state.previewing ? '■' : '▶'}</span> {state.previewing ? RECORDER_TEXT.stopPlaying : RECORDER_TEXT.play}
        </button>
        {state.canZoom && (
          <button
            type="button"
            className="btn btn-outline"
            disabled={saving}
            onClick={() => (state.zoomed ? session.showWholeFile() : session.zoomToSelection())}
          >
            {state.zoomed ? CLIP_TEXT.zoomOut : CLIP_TEXT.zoomIn}
          </button>
        )}
        <span className="ss-field-hint">{keepingClipText(state.keptMs, state.lengthMs)}</span>
      </div>

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

      <div className="recorder-actions">
        <button ref={saveRef} type="button" className="btn btn-accent btn-big" disabled={saving} aria-busy={saving} onClick={() => void session.save()}>
          {saving ? RECORDER_TEXT.saving : RECORDER_TEXT.save}
        </button>
        <button type="button" className="btn btn-outline" disabled={saving} onClick={() => void chooseAnother()}>
          {CLIP_TEXT.chooseAnother}
        </button>
      </div>

      <div className="recorder-copy">
        <button type="button" className="btn btn-outline" disabled={saving} onClick={() => void saveCopy()}>
          {RECORDER_TEXT.saveCopy}
        </button>
        <p className={copyNotice?.kind === 'problem' ? 'recorder-copy-status is-problem' : 'recorder-copy-status'} role="status">
          {copyNotice?.text}
        </p>
      </div>
    </div>
  );
}
