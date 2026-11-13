import { clock, seconds } from './rules';

/** Everything the recorder says, in StreamStudio's plain voice: what happened, then what to do next. */

export type NoticeKind = 'hint' | 'problem';

export interface Notice {
  kind: NoticeKind;
  text: string;
}

export const RECORDER_TEXT = {
  title: 'Record a sound',
  close: 'Close recorder',
  recordButton: 'Record',
  recordHint: 'Record a sound with your microphone',
  microphone: 'Microphone',
  meterName: 'Microphone level',
  record: 'Record',
  stop: 'Stop',
  readyTime: 'Up to 1 minute',
  start: 'Start',
  end: 'End',
  play: 'Play',
  stopPlaying: 'Stop playing',
  name: 'Name',
  save: 'Save sound',
  saving: 'Saving…',
  recordAgain: 'Record again',
  discard: 'Discard',
  saveCopy: 'Also save a copy as a file',
  confirm: 'Throw this recording away?',
  keepIt: 'Keep it',
  keepRecording: 'Keep recording',
  throwAway: 'Throw away',
  retry: 'Try again',
  opening: 'Opening the microphone…',
  waveform: 'The recording, loud parts tall and quiet parts short',
} as const;

export const NOTICES = {
  stoppedAtLimit: { kind: 'hint', text: 'Stopped after 1 minute, the longest a recorded sound can be.' },
  silent: {
    kind: 'problem',
    text: "I didn't hear anything. Check that your microphone isn't muted or blocked on this device, then record again.",
  },
  tooShort: { kind: 'problem', text: 'That was too short to save. Record again.' },
  trimmed: { kind: 'hint', text: 'I cut the quiet at the start and end. Drag Start and End to change that.' },
  deviceLost: { kind: 'problem', text: 'The microphone was disconnected, so recording stopped.' },
  saveFailed: { kind: 'problem', text: "Couldn't save the sound. Try again, or record it again." },
  previewFailed: { kind: 'problem', text: "I couldn't play the recording back. Try again." },
} as const satisfies Record<string, Notice>;

/** Why the microphone couldn't be used. */
export type MicProblemKind = 'insecure' | 'unsupported' | 'denied' | 'missing' | 'busy' | 'unknown';

export const MIC_PROBLEM_TEXT: Record<MicProblemKind, string> = {
  insecure: 'The microphone only works when Soundboard is opened from its normal https:// link. Open it from there and try again.',
  unsupported: "This browser can't record from a microphone. Try Safari, Chrome, Edge or Firefox.",
  denied: 'Your device is blocking the microphone for Soundboard. Allow it in your browser or phone settings, then press Try again.',
  missing: "I couldn't find a microphone. Plug one in (or unplug headphones that have no microphone), then press Try again.",
  busy: 'Another app is using the microphone. Close it, then press Try again.',
  unknown: "The microphone didn't start. Press Try again, and if it keeps happening, close Soundboard and open it again.",
};

/** Trying again can't help on a browser that has no microphone support at all. */
export const canRetryMic = (kind: MicProblemKind): boolean => kind !== 'insecure' && kind !== 'unsupported';

/** The microphone couldn't be opened. The message is safe to show to her as it is. */
export class MicProblem extends Error {
  readonly kind: MicProblemKind;

  constructor(kind: MicProblemKind) {
    super(MIC_PROBLEM_TEXT[kind]);
    this.name = 'MicProblem';
    this.kind = kind;
  }
}

/** What went wrong with the microphone, from the error the browser threw. */
export const micProblemKind = (error: unknown): MicProblemKind => {
  if (error instanceof MicProblem) return error.kind;
  const name = typeof error === 'object' && error !== null ? String((error as { name?: unknown }).name ?? '') : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'missing';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy';
    default:
      return 'unknown';
  }
};

/** Shown beside the Record button while recording: "0:07 of 1:00". */
export const recordingTime = (elapsedMs: number, limitMs: number): string => `${clock(elapsedMs)} of ${clock(limitMs)}`;

/** What is kept of what was recorded: "Keeping 3.2 of 7.5 seconds". */
export const keepingText = (keptMs: number, totalMs: number): string => `Keeping ${seconds(keptMs)} of ${seconds(totalMs)} seconds`;

/** A sound has been added from a recording. */
export const addedText = (soundName: string, boardName: string): string => `Added “${soundName}” to ${boardName}.`;

/** Said above the review when a recording will take the place of a sound's file. */
export const replacingText = (soundName: string): string =>
  `This will replace ${soundName.trim() ? `the sound on “${soundName}”` : 'the sound you are editing'}. Its name, colour, volume and key stay the same.`;
