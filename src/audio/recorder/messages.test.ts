import { describe, expect, it } from 'vitest';
import {
  addedText,
  canRetryMic,
  keepingText,
  MIC_PROBLEM_TEXT,
  MicProblem,
  micProblemKind,
  NOTICES,
  recordingTime,
  replacingText,
} from './messages';

const named = (name: string): Error => Object.assign(new Error('x'), { name });

describe('why the microphone failed', () => {
  it('knows when the device is blocking it', () => {
    expect(micProblemKind(new DOMException('no', 'NotAllowedError'))).toBe('denied');
    expect(micProblemKind(named('PermissionDeniedError'))).toBe('denied');
    expect(micProblemKind(named('SecurityError'))).toBe('denied');
  });

  it("knows when there isn't one", () => {
    expect(micProblemKind(new DOMException('none', 'NotFoundError'))).toBe('missing');
    expect(micProblemKind(named('OverconstrainedError'))).toBe('missing');
    expect(micProblemKind(named('DevicesNotFoundError'))).toBe('missing');
  });

  it('knows when another app has it', () => {
    expect(micProblemKind(new DOMException('busy', 'NotReadableError'))).toBe('busy');
    expect(micProblemKind(named('AbortError'))).toBe('busy');
    expect(micProblemKind(named('TrackStartError'))).toBe('busy');
  });

  it('keeps what it was told when the problem is already known', () => {
    expect(micProblemKind(new MicProblem('insecure'))).toBe('insecure');
    expect(micProblemKind(new MicProblem('unsupported'))).toBe('unsupported');
  });

  it('says it is unknown for anything else', () => {
    expect(micProblemKind(new Error('boom'))).toBe('unknown');
    expect(micProblemKind(null)).toBe('unknown');
    expect(micProblemKind(undefined)).toBe('unknown');
    expect(micProblemKind('nope')).toBe('unknown');
    expect(micProblemKind(42)).toBe('unknown');
    expect(micProblemKind({})).toBe('unknown');
  });

  it('has a friendly message for each, safe to show as it is', () => {
    for (const [kind, text] of Object.entries(MIC_PROBLEM_TEXT)) {
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(/NotAllowedError|DOMException|getUserMedia|undefined/);
      expect(new MicProblem(kind as keyof typeof MIC_PROBLEM_TEXT).message).toBe(text);
    }
    expect(MIC_PROBLEM_TEXT.denied).toBe(
      'Your device is blocking the microphone for Soundboard. Allow it in your browser or phone settings, then press Try again.',
    );
  });

  it("only offers Try again when trying again can help", () => {
    expect(canRetryMic('denied')).toBe(true);
    expect(canRetryMic('missing')).toBe(true);
    expect(canRetryMic('busy')).toBe(true);
    expect(canRetryMic('unknown')).toBe(true);
    expect(canRetryMic('insecure')).toBe(false);
    expect(canRetryMic('unsupported')).toBe(false);
  });
});

describe('what the recorder says', () => {
  it("uses StreamStudio's words", () => {
    expect(NOTICES.trimmed.text).toBe('I cut the quiet at the start and end. Drag Start and End to change that.');
    expect(NOTICES.tooShort.text).toBe('That was too short to save. Record again.');
    expect(NOTICES.stoppedAtLimit.text).toBe('Stopped after 1 minute, the longest a recorded sound can be.');
    expect(NOTICES.saveFailed.text).toBe("Couldn't save the sound. Try again, or record it again.");
  });

  it('tells a problem from a hint', () => {
    expect(NOTICES.silent.kind).toBe('problem');
    expect(NOTICES.tooShort.kind).toBe('problem');
    expect(NOTICES.deviceLost.kind).toBe('problem');
    expect(NOTICES.saveFailed.kind).toBe('problem');
    expect(NOTICES.previewFailed.kind).toBe('problem');
    expect(NOTICES.trimmed.kind).toBe('hint');
    expect(NOTICES.stoppedAtLimit.kind).toBe('hint');
  });

  it('shows how long it has been recording', () => {
    expect(recordingTime(7000, 60000)).toBe('0:07 of 1:00');
    expect(recordingTime(0, 60000)).toBe('0:00 of 1:00');
  });

  it('shows how much is kept', () => {
    expect(keepingText(3249, 7500)).toBe('Keeping 3.2 of 7.5 seconds');
  });

  it('says what was added, and what a recording will replace', () => {
    expect(addedText('Door slam', 'My sounds')).toBe('Added “Door slam” to My sounds.');
    expect(replacingText('Honk')).toBe('This will replace the sound on “Honk”. Its name, colour, volume and key stay the same.');
    expect(replacingText('  ')).toBe('This will replace the sound you are editing. Its name, colour, volume and key stay the same.');
  });
});
