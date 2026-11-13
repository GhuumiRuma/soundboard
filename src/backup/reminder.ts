/**
 * When to remind her to save a backup. Clearing the browser's data or uninstalling the app deletes her sounds,
 * so a gentle nudge now and then is kind. It never shows before she has a sound, and it never nags.
 */

const DAY = 24 * 60 * 60 * 1000;

/** A backup newer than this needs no reminder. */
export const BACKUP_FRESH_DAYS = 14;
/** How long after her first sound before the very first reminder. */
export const FIRST_REMINDER_DAYS = 3;
/** How long "Not now" keeps the reminder away. */
export const SNOOZE_DAYS = 7;

export interface ReminderInput {
  /** How many sounds she has. */
  sounds: number;
  /** When she last saved a backup (milliseconds), or null. */
  lastBackupAt: number | null;
  /** The reminder stays away until this time (milliseconds), or null. */
  remindAfter: number | null;
  now: number;
}

export interface ReminderPlan {
  show: boolean;
  /** When this is a number, store it as `remindAfter` so the first reminder comes in a few days, not at once. */
  startClockAt: number | null;
}

const HIDE: ReminderPlan = { show: false, startClockAt: null };

export function planReminder({ sounds, lastBackupAt, remindAfter, now }: ReminderInput): ReminderPlan {
  if (sounds === 0) return HIDE;
  if (lastBackupAt !== null && now - lastBackupAt < BACKUP_FRESH_DAYS * DAY) return HIDE;
  if (remindAfter === null) {
    return lastBackupAt === null ? { show: false, startClockAt: now + FIRST_REMINDER_DAYS * DAY } : { show: true, startClockAt: null };
  }
  return { show: now >= remindAfter, startClockAt: null };
}

/** When "Not now" lets the reminder come back. */
export const snoozeUntil = (now: number): number => now + SNOOZE_DAYS * DAY;
