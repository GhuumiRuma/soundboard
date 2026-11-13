/** What a recorded sound is called, made safe to use as a file's name. Ported from StreamStudio's RecordingNames. */

export const DEFAULT_RECORDING_NAME = 'My recording';
export const MAX_FILE_NAME_LENGTH = 60;

// Names Windows keeps for itself: a file called "CON.wav" can't be made there, so these get "My " in front.
const DEVICE_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
  'COM\u00B9',
  'COM\u00B2',
  'COM\u00B3',
  'LPT\u00B9',
  'LPT\u00B2',
  'LPT\u00B3',
]);

// Spaces, control characters and the ones a file name can't hold on Windows.
const UNSAFE_RUNS = /[\s\u0000-\u001f\u007f-\u009f<>:"/\\|?*]+/g;

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;

/**
 * What she typed, with anything a file's name can't hold turned into a space, extra spaces and trailing dots removed,
 * and no more than 60 characters. Nothing left is "My recording".
 */
export const recordingFileBase = (name: string | null | undefined): string => {
  let cleaned = (name ?? '').replace(UNSAFE_RUNS, ' ').trim();

  const dot = cleaned.indexOf('.');
  const firstPart = (dot < 0 ? cleaned : cleaned.slice(0, dot)).trimEnd();
  if (DEVICE_NAMES.has(firstPart.toUpperCase())) cleaned = `My ${cleaned}`;

  if (cleaned.length > MAX_FILE_NAME_LENGTH) {
    let cut = MAX_FILE_NAME_LENGTH;
    if (isHighSurrogate(cleaned.charCodeAt(cut - 1))) cut--;
    cleaned = cleaned.slice(0, cut);
  }

  cleaned = cleaned.replace(/[ .]+$/, '');
  return cleaned.length === 0 ? DEFAULT_RECORDING_NAME : cleaned;
};

/** The file's name for a recording: "My recording.wav". */
export const recordingFileName = (name: string | null | undefined): string => `${recordingFileBase(name)}.wav`;
