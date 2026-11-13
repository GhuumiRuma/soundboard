import { describe, expect, it } from 'vitest';
import { installMessages, installNote, installSteps, updateMessages } from './messages';

const everyText = (): string[] => [
  ...Object.values(updateMessages),
  ...Object.values(installMessages),
  ...Object.values(installSteps).flat(),
  ...installNote('button', true),
  ...installNote('ios', true),
  ...installNote('ios-browser', true),
];

describe('install and update wording', () => {
  it('keeps to plain words', () => {
    for (const text of everyText()) {
      expect(text).not.toMatch(/\b(PWA|service worker|cache|manifest|install prompt|offline-first)\b/i);
      expect(text).not.toMatch(/[’‘]/);
      expect(text.trim()).toBe(text);
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it('says what the update does to her sounds, and what to do when it does not work', () => {
    expect(updateMessages.stays).toBe('Your boards and sounds will still be here.');
    expect(updateMessages.stuck).toContain('Close Soundboard, then open it again');
  });
});

describe('installSteps', () => {
  it('names the Share button and Add to Home Screen on iPhone and iPad', () => {
    for (const key of ['ios', 'ios-browser'] as const) {
      const text = installSteps[key].join(' ');
      expect(text).toContain('Share button');
      expect(text).toContain('Add to Home Screen');
    }
  });

  it('sends other iPhone browsers to Safari', () => {
    expect(installSteps['ios-browser'].join(' ')).toContain('open this page in Safari');
    expect(installSteps.ios.join(' ')).not.toContain('open this page in Safari');
  });

  it('explains that sounds added in Safari do not move to the Home Screen app by themselves', () => {
    const text = installSteps.ios.join(' ');
    expect(text).toContain('Save a backup');
    expect(text).toContain('Restore from a backup');
  });

  it('has Android and computer steps', () => {
    expect(installSteps.android.join(' ')).toContain('Install app');
    expect(installSteps.computer.join(' ')).toContain('Install Soundboard');
    expect(installSteps.computer.join(' ')).toContain('Add to Dock');
  });
});

describe('installNote', () => {
  it('is one short line when the browser can install it', () => {
    expect(installNote('button', false)).toEqual([installMessages.offer]);
    expect(installNote('button', true)).toEqual([installMessages.offer]);
  });

  it('gives the Share steps on iPhone', () => {
    const [first] = installNote('ios', false);
    expect(first).toContain('Share button');
    expect(first).toContain('Add to Home Screen');
    expect(installNote('ios', false)).toHaveLength(1);
  });

  it('mentions moving sounds only when she already has some', () => {
    expect(installNote('ios', true)).toHaveLength(2);
    expect(installNote('ios', true)[1]).toContain('Save a backup');
    expect(installNote('ios-browser', true)).toHaveLength(2);
  });

  it('asks other iPhone browsers to try Safari', () => {
    expect(installNote('ios-browser', false)[0]).toContain('open this page in Safari');
    expect(installNote('ios', false)[0]).not.toContain('open this page in Safari');
  });

  it('has no note for the other cases', () => {
    expect(installNote('installed', true)).toEqual([]);
    expect(installNote('android', true)).toEqual([]);
    expect(installNote('computer', true)).toEqual([]);
  });
});
