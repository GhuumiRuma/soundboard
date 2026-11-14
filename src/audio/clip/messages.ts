import type { Notice } from '../recorder/messages';
import { clock, seconds, stamp } from '../recorder/rules';
import { MAX_CLIP_SECONDS, MAX_SOURCE_BYTES, MAX_SOURCE_SECONDS } from './rules';

/** Everything the clipper says, in StreamStudio's plain voice: what happened, then what to do next. */

const MEGABYTES = Math.round(MAX_SOURCE_BYTES / (1024 * 1024));
const SOURCE_MINUTES = Math.round(MAX_SOURCE_SECONDS / 60);
const CLIP_MINUTES = Math.round(MAX_CLIP_SECONDS / 60);

export const CLIP_TEXT = {
  title: 'Clip a sound',
  button: 'Clip a sound',
  /** On the small buttons next to Add and Record, where there is no room for more. */
  short: 'Clip',
  buttonHint: 'Make a sound from part of a video or a long sound file',
  intro: 'Choose a video or a sound file, then pick the part you want. It becomes a new button.',
  choose: 'Choose a file',
  chooseAnother: 'Choose another file',
  drop: 'Or drop a file here.',
  limits: `Most videos and sound files work (up to ${MEGABYTES} MB and ${SOURCE_MINUTES} minutes long).`,
  rights: 'Only clip things you made or have permission to use.',
  cancel: 'Cancel',
  player: 'Your file. Play it to find the part you want.',
  playerFailed: "I can't play this file here. You can still pick the part with Start and End below.",
  setFromPlayer: 'Set Start or End to where the player is now',
  startHere: 'Start here',
  endHere: 'End here',
  zoomIn: 'Zoom in on the clip',
  zoomOut: 'Show the whole file',
  waveform: 'The file, loud parts tall and quiet parts short',
} as const;

/** "Opening “funny.mp4”…" while a file is being read. */
export const openingText = (fileName: string): string => `Opening “${fileName}”…`;

/** The whole file's length, to the tenth when it isn't a whole second ("0:05.9"), so what is kept never looks longer than the whole. */
const lengthText = (ms: number): string => (seconds(ms).endsWith('.0') ? clock(ms) : stamp(ms));

/** What is kept of the file: "Keeping 3.2 seconds of 2:05". */
export const keepingClipText = (keptMs: number, totalMs: number): string => `Keeping ${seconds(keptMs)} seconds of ${lengthText(totalMs)}`;

/** A place in the file as a screen reader should say it: "7.5 seconds", or "2 minutes 5.3 seconds". */
export const placeText = (ms: number): string => {
  const whole = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const minutes = Math.floor(whole / 60_000);
  const rest = `${seconds(whole - minutes * 60_000)} seconds`;
  if (minutes === 0) return rest;
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ${rest}`;
};

/** Said after "Start here" or "End here", so she hears where the handle went. */
export const placedText = (which: 'start' | 'end', ms: number): string => `${which === 'start' ? 'Start' : 'End'} is now at ${placeText(ms)}.`;

/** Why a file couldn't be opened. Each is shown on the first screen, where she can choose another. */
export const CLIP_PROBLEMS = {
  tooBig: `That file is too big for me to open (the limit is ${MEGABYTES} MB).`,
  empty: 'That file is empty. Pick a video or sound file with content.',
  tooLong: `That's longer than ${SOURCE_MINUTES} minutes, which is the longest I can open. Try a shorter file.`,
  picture: "That's a picture — Clip a sound needs a video or a sound file.",
  unreadable: "I couldn't get the sound out of that file. Try a shorter video, or an MP3, WAV or M4A.",
  silent: "I didn't hear any sound in that file. Try another one.",
  tooShort: "That's too short to make a sound from. Try another file.",
  readFailed: "I couldn't open that file. Try choosing it again.",
} as const;

export type ClipProblem = keyof typeof CLIP_PROBLEMS;

/** Things the clipper wants her to know once a file is open. */
export const CLIP_NOTICES = {
  longest: {
    kind: 'hint',
    text: `A clip can be up to ${CLIP_MINUTES} minutes long, so Start and End can't go any further apart.`,
  },
  saveFailed: { kind: 'problem', text: "Couldn't save the sound. Try again, or choose the file again." },
  previewFailed: { kind: 'problem', text: "I couldn't play the clip. Try again." },
} as const satisfies Record<string, Notice>;

/** A long file only starts with a short part picked, so she is told how to pick the rest. */
export const longFileNotice = (lengthMs: number): Notice => ({
  kind: 'hint',
  text: `This file is ${clock(lengthMs)} long. Play the file above, then press Start here and End here where the part you want begins and ends.`,
});
