import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { captureKey, eventCode, formatHeld, formatKey, heldModifiers, type Modifier } from '../keys/keyString';
import { unsupportedKeyText, type HotkeyNote } from '../keys/messages';
import { suspendSoundKeys } from '../keys/soundKeys';
import type { DeviceOs } from '../lib/device';

/** A click right after a key was picked comes from that same key press (Space presses a button), so it must not start a new recording. */
const JUST_STOPPED_MS = 300;

interface HotkeyRecorderProps {
  /** What the key is for, like "Sound shortcut". */
  label: string;
  /** The saved key, like "Ctrl+Alt+1", or null when there is none. */
  value: string | null;
  onChange: (key: string | null) => void;
  /** Why a key can't be used (someone else has it, the browser keeps it), or null when it is fine. A refused key leaves the box listening. */
  check?: (key: string) => string | null;
  /** A line of help under the box while she isn't picking a key. */
  note?: HotkeyNote | null;
  os: DeviceOs;
  /** Put the label on the left with the box beside it, instead of above. */
  inline?: boolean;
  /** What a screen reader says for the little × button. */
  clearLabel: string;
}

/**
 * A box you click and then press the keys you want, like StreamStudio's. While it listens it has the keyboard to itself:
 * every key goes to the box (so Escape doesn't close the editor and Ctrl+Space doesn't click anything) and her sound keys are switched off.
 */
export function HotkeyRecorder({ label, value, onChange, check, note, os, inline, clearLabel }: HotkeyRecorderProps) {
  const labelId = useId();
  const boxId = useId();
  const statusId = useId();
  const noteId = useId();
  const boxRef = useRef<HTMLButtonElement>(null);
  const [recording, setRecording] = useState(false);
  const [held, setHeld] = useState<readonly Modifier[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  /** The key whose release should not click the box, because that key press was just picked or cancelled. */
  const swallowRelease = useRef<string | null>(null);
  const stoppedAt = useRef(-Infinity);

  useEffect(() => {
    if (!recording) return undefined;
    return suspendSoundKeys();
  }, [recording]);

  const stop = () => {
    setRecording(false);
    setHeld([]);
    setProblem(null);
    stoppedAt.current = performance.now();
  };

  const start = () => {
    if (recording || performance.now() - stoppedAt.current < JUST_STOPPED_MS) return;
    // Safari doesn't focus a button when it is clicked, and the box can only hear keys while it has focus.
    boxRef.current?.focus();
    swallowRelease.current = null;
    setHeld([]);
    setProblem(null);
    setRecording(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    const code = eventCode(e);
    const withoutTab = !e.ctrlKey && !e.altKey && !e.metaKey;
    // Tab (or Shift+Tab) lets her move on to the next thing, so it is the one key that is not swallowed.
    if (code === 'Tab' && withoutTab) {
      stop();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    swallowRelease.current = code;
    if (e.repeat || e.nativeEvent.isComposing) return;

    const anyModifier = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
    if (code === 'Escape' && !anyModifier) {
      stop();
      return;
    }
    if (code === 'Backspace' || (code === 'Delete' && !anyModifier)) {
      stop();
      onChange(null);
      return;
    }

    const capture = captureKey(e);
    if (capture.kind === 'modifiers') {
      setHeld(capture.held);
      setProblem(null);
      return;
    }
    setHeld([]);
    if (capture.kind === 'unsupported') {
      setProblem(unsupportedKeyText(os));
      return;
    }
    const refused = check?.(capture.key) ?? null;
    if (refused) {
      setProblem(refused);
      return;
    }
    stop();
    onChange(capture.key);
  };

  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (swallowRelease.current !== null && swallowRelease.current === eventCode(e)) {
      swallowRelease.current = null;
      e.preventDefault();
      e.stopPropagation();
    }
    if (recording) setHeld(heldModifiers(e));
  };

  const shown = recording ? (held.length > 0 ? formatHeld(held, os) : 'Press the keys…') : formatKey(value, os);
  const status = recording ? (problem ?? 'Press Escape to cancel, or Backspace to clear.') : '';
  const statusTone = recording && problem ? 'problem' : 'ok';
  const extra = !recording && note ? note : null;
  const describedBy = extra ? `${statusId} ${noteId}` : statusId;

  return (
    <div className={`hotkey-recorder${inline ? ' inline' : ''}`} data-captures-keys={recording ? '' : undefined}>
      <label className="ss-field-label hotkey-label" id={labelId} htmlFor={boxId}>
        {label}
      </label>
      <button
        ref={boxRef}
        type="button"
        id={boxId}
        className={`hotkey-box${recording ? ' recording' : ''}`}
        title="Click, then press the keys you want to use"
        aria-labelledby={`${labelId} ${boxId}`}
        aria-describedby={describedBy}
        onClick={start}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => {
          swallowRelease.current = null;
          if (recording) stop();
        }}
      >
        {shown}
      </button>
      <button type="button" className="hotkey-clear" title="Clear shortcut" aria-label={clearLabel} disabled={value === null} onClick={() => onChange(null)}>
        <span aria-hidden="true">×</span>
      </button>
      <div id={statusId} className={`hotkey-status ${statusTone}`} aria-live="polite">
        {status}
      </div>
      {extra && (
        <div id={noteId} className={`hotkey-status ${extra.tone}`}>
          {extra.text}
        </div>
      )}
    </div>
  );
}
