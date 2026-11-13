import { describe, expect, it } from 'vitest';
import { BACKUP_FRESH_DAYS, FIRST_REMINDER_DAYS, SNOOZE_DAYS, planReminder, snoozeUntil } from './reminder';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2025, 4, 12, 12);

const plan = (overrides: Partial<Parameters<typeof planReminder>[0]> = {}) =>
  planReminder({ sounds: 5, lastBackupAt: null, remindAfter: null, now: NOW, ...overrides });

describe('planReminder', () => {
  it('never shows before she has a sound', () => {
    expect(plan({ sounds: 0 })).toEqual({ show: false, startClockAt: null });
    expect(plan({ sounds: 0, lastBackupAt: NOW - 100 * DAY, remindAfter: NOW - DAY })).toEqual({ show: false, startClockAt: null });
  });

  it('waits a few days after the first sound instead of showing at once', () => {
    expect(plan()).toEqual({ show: false, startClockAt: NOW + FIRST_REMINDER_DAYS * DAY });
  });

  it('shows once that wait is over', () => {
    expect(plan({ remindAfter: NOW - 1 })).toEqual({ show: true, startClockAt: null });
    expect(plan({ remindAfter: NOW })).toEqual({ show: true, startClockAt: null });
  });

  it('stays quiet until the wait is over', () => {
    expect(plan({ remindAfter: NOW + 1 })).toEqual({ show: false, startClockAt: null });
  });

  it('stays quiet while a backup is recent', () => {
    expect(plan({ lastBackupAt: NOW - (BACKUP_FRESH_DAYS * DAY - 1) })).toEqual({ show: false, startClockAt: null });
    expect(plan({ lastBackupAt: NOW - DAY, remindAfter: NOW - DAY })).toEqual({ show: false, startClockAt: null });
  });

  it('shows when her last backup is old and no wait is set', () => {
    expect(plan({ lastBackupAt: NOW - BACKUP_FRESH_DAYS * DAY })).toEqual({ show: true, startClockAt: null });
  });

  it('keeps to the wait when her last backup is old', () => {
    expect(plan({ lastBackupAt: NOW - 30 * DAY, remindAfter: NOW + DAY })).toEqual({ show: false, startClockAt: null });
    expect(plan({ lastBackupAt: NOW - 30 * DAY, remindAfter: NOW - DAY })).toEqual({ show: true, startClockAt: null });
  });
});

describe('snoozeUntil', () => {
  it('is a week from now', () => {
    expect(SNOOZE_DAYS).toBe(7);
    expect(snoozeUntil(NOW)).toBe(NOW + 7 * DAY);
  });

  it('keeps the reminder away until then', () => {
    expect(plan({ remindAfter: snoozeUntil(NOW) })).toEqual({ show: false, startClockAt: null });
    expect(planReminder({ sounds: 5, lastBackupAt: null, remindAfter: snoozeUntil(NOW), now: NOW + 7 * DAY }).show).toBe(true);
  });
});
