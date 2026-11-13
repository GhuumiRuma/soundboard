import { describe, expect, it } from 'vitest';
import { importMessages } from '../storage/import';
import {
  addedMessage,
  backupMessages,
  lastBackupText,
  leftOutMessage,
  restoredMessage,
  skippedMessages,
} from './messages';

describe('restoredMessage', () => {
  it('counts boards and sounds', () => {
    expect(restoredMessage(3, 12)).toBe('Restored your backup: 3 boards and 12 sounds');
  });

  it('says one board and one sound in the singular', () => {
    expect(restoredMessage(1, 1)).toBe('Restored your backup: 1 board and 1 sound');
  });
});

describe('addedMessage', () => {
  it('counts what was added', () => {
    expect(addedMessage(2, 5, 0)).toBe('Added 2 boards and 5 sounds from your backup');
  });

  it('says when sound keys were left off', () => {
    expect(addedMessage(1, 4, 1)).toBe(
      'Added 1 board and 4 sounds from your backup. 1 sound key was already in use, so I left it off.',
    );
    expect(addedMessage(1, 4, 3)).toBe(
      'Added 1 board and 4 sounds from your backup. 3 sound keys were already in use, so I left them off.',
    );
  });
});

describe('skippedMessages', () => {
  it('has nothing to say when nothing was skipped', () => {
    expect(skippedMessages([])).toEqual([]);
  });

  it('says why each sound was left out', () => {
    expect(
      skippedMessages([
        { name: 'Honk', reason: 'missing' },
        { name: 'Bell', reason: 'tooBig' },
        { name: 'Pop', reason: 'broken' },
      ]),
    ).toEqual([
      "“Honk” wasn't restored. Its file isn't in the backup.",
      `“Bell” wasn't restored. ${importMessages.tooBig}`,
      "“Pop” wasn't restored. Its file is damaged, or isn't a sound I can use (MP3, WAV or OGG).",
    ]);
  });

  it('names the first three and counts the rest', () => {
    const skipped = ['A', 'B', 'C', 'D'].map((name) => ({ name, reason: 'missing' as const }));
    const lines = skippedMessages(skipped);
    expect(lines).toHaveLength(4);
    expect(lines[2]).toContain('“C”');
    expect(lines[3]).toBe("…and 1 more sound wasn't restored.");
  });

  it('counts several others in the plural', () => {
    const skipped = ['A', 'B', 'C', 'D', 'E', 'F'].map((name) => ({ name, reason: 'missing' as const }));
    expect(skippedMessages(skipped).at(-1)).toBe("…and 3 more sounds weren't restored.");
  });

  it('shows the same message once, so no two messages are the same', () => {
    const lines = skippedMessages([
      { name: 'Honk', reason: 'missing' },
      { name: 'Honk', reason: 'missing' },
    ]);
    expect(lines).toHaveLength(1);
    expect(new Set(lines).size).toBe(lines.length);
  });
});

describe('leftOutMessage', () => {
  it('names a sound whose file could not be found', () => {
    expect(leftOutMessage(['Honk'])).toBe(
      "1 sound couldn't go into the backup because I couldn't find its file on this device: “Honk”.",
    );
  });

  it('names up to three and counts the others', () => {
    expect(leftOutMessage(['A', 'B', 'C'])).toBe(
      "3 sounds couldn't go into the backup because I couldn't find their files on this device: “A”, “B”, “C”.",
    );
    expect(leftOutMessage(['A', 'B', 'C', 'D', 'E'])).toBe(
      "5 sounds couldn't go into the backup because I couldn't find their files on this device: “A”, “B”, “C” and 2 others.",
    );
  });
});

describe('lastBackupText', () => {
  const at = (year: number, month: number, day: number, hour = 12) => new Date(year, month - 1, day, hour).getTime();

  it('says she has not saved one yet', () => {
    expect(lastBackupText(null, at(2025, 5, 12))).toBe("You haven't saved a backup yet.");
  });

  it('says today for any time earlier the same day', () => {
    expect(lastBackupText(at(2025, 5, 12, 0), at(2025, 5, 12, 23))).toBe('Your last backup was today.');
  });

  it('counts calendar days, so late at night is still yesterday in the morning', () => {
    expect(lastBackupText(at(2025, 5, 11, 23), at(2025, 5, 12, 1))).toBe('Your last backup was yesterday.');
  });

  it('counts days', () => {
    expect(lastBackupText(at(2025, 5, 1), at(2025, 5, 12))).toBe('Your last backup was 11 days ago.');
  });

  it('counts the days across a clock change', () => {
    expect(lastBackupText(at(2025, 3, 20), at(2025, 4, 2))).toBe('Your last backup was 13 days ago.');
    expect(lastBackupText(at(2025, 10, 20), at(2025, 11, 3))).toBe('Your last backup was 14 days ago.');
  });

  it('gives a date once it was a long time ago', () => {
    const text = lastBackupText(at(2024, 1, 15), at(2025, 5, 12));
    expect(text.startsWith('Your last backup was on ')).toBe(true);
    expect(text).toContain('2024');
  });

  it('does not fall over when the clock is behind', () => {
    expect(lastBackupText(at(2025, 5, 13), at(2025, 5, 12))).toBe('Your last backup was today.');
  });
});

describe('backupMessages', () => {
  it('uses straight apostrophes and no jargon', () => {
    for (const text of Object.values(backupMessages)) {
      expect(text).not.toContain('’');
      expect(text).not.toMatch(/\b(json|zip archive|corrupt|exception|error code)\b/i);
    }
  });
});
