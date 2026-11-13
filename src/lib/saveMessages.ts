import type { SaveOutcome } from '../platform/types';

/** Something to tell her after she tried to keep a file. A "hint" is good news; a "problem" needs her to read it. */
export interface SaveNotice {
  kind: 'hint' | 'problem';
  text: string;
}

export const SAVE_FAILED = "I couldn't save that file. Please try again.";

/**
 * What to say after a file was saved. `what` finishes the sentence "Saved …", like "your recording" or "your backup".
 * Nothing needs saying when she closed the save box, or when the share sheet opened (the sheet is the answer).
 */
export function saveNotice(outcome: SaveOutcome, what: string): SaveNotice | null {
  switch (outcome.status) {
    case 'saved':
      return { kind: 'hint', text: outcome.where ? `Saved ${what} to ${outcome.where}.` : `Saved ${what}.` };
    case 'failed':
      return { kind: 'problem', text: outcome.message.trim() || SAVE_FAILED };
    case 'shared':
    case 'cancelled':
      return null;
  }
}
