import { describe, expect, it } from 'vitest';
import type { BoardsData, SoundItem } from '../model/types';
import { keyNote, soundKeyNotice, soundKeysStatusLine, soundKeyTip, unsupportedKeyText } from './messages';

const sound = (id: string, name: string, hotkey: string | null): SoundItem => ({
  id,
  name,
  emoji: '🔊',
  color: '#7C3AED',
  mediaId: `media-${id}`,
  originalFileName: null,
  volume: 0.8,
  hotkey,
});

const data = (sounds: SoundItem[], stopAllKey: string | null = null): BoardsData => ({
  boards: [{ id: 'b1', name: 'My sounds', sounds }],
  masterVolume: 1,
  stopAllKey,
});

const web = { global: false, os: 'windows' as const };
const desktop = { global: true, os: 'windows' as const };

describe('soundKeysStatusLine', () => {
  const withKey = data([sound('a', 'Honk', 'Ctrl+Alt+1')]);

  it('says when they are off', () => {
    expect(soundKeysStatusLine({ enabled: false, global: false, data: withKey })).toBe('Sound keys are off.');
  });

  it('says where they work', () => {
    expect(soundKeysStatusLine({ enabled: true, global: false, data: withKey })).toBe('Your sound keys work while this window is in front.');
    expect(soundKeysStatusLine({ enabled: true, global: true, data: withKey })).toBe(
      'Your sound keys work even while a game or another app is in front.',
    );
  });

  it('counts the Stop all key as a sound key', () => {
    expect(soundKeysStatusLine({ enabled: true, global: false, data: data([sound('a', 'Honk', null)], 'Ctrl+Alt+0') })).toMatch(/work while this window/);
  });

  it('points her to Edit when there is no key yet', () => {
    expect(soundKeysStatusLine({ enabled: true, global: false, data: data([sound('a', 'Honk', null)]) })).toBe(
      'None of your sounds has a key yet. Pick one with ✏️ Edit.',
    );
    expect(soundKeysStatusLine({ enabled: true, global: false, data: data([]) })).toBe('Add a sound first, then pick a key for it with ✏️ Edit.');
  });
});

describe('soundKeyNotice', () => {
  const two = data([sound('a', 'Honk', 'Ctrl+Alt+1'), sound('b', 'Beep', 'Ctrl+Alt+2')], 'Ctrl+Alt+0');

  it('has nothing to say when every key works', () => {
    expect(soundKeyNotice({ unavailable: [], failed: false }, two, desktop)).toBeNull();
  });

  it('names the one key that is not working', () => {
    expect(soundKeyNotice({ unavailable: ['Ctrl+Alt+1'], failed: false }, two, desktop)).toEqual({
      title: "A sound key isn't working",
      text: 'Ctrl + Alt + 1 for “Honk”: another app is probably using it. You can pick another key with ✏️ Edit.',
    });
  });

  it('names the Stop all key too', () => {
    expect(soundKeyNotice({ unavailable: ['Ctrl+Alt+0'], failed: false }, two, desktop)?.text).toMatch(/^Ctrl \+ Alt \+ 0 for “Stop all sounds”/);
  });

  it('lists several at once', () => {
    expect(soundKeyNotice({ unavailable: ['Ctrl+Alt+1', 'Ctrl+Alt+2'], failed: false }, two, desktop)).toEqual({
      title: "Some sound keys aren't working",
      text: "2 sound keys can't be used, most likely because another app uses them: “Honk”, “Beep”. You can pick other keys with ✏️ Edit.",
    });
  });

  it('uses the names of this device for keys', () => {
    expect(soundKeyNotice({ unavailable: ['Ctrl+Alt+1'], failed: false }, two, { global: true, os: 'mac' })?.text).toMatch(/^Ctrl \+ Option \+ 1 for/);
  });

  it('forgets a key that is no longer in use', () => {
    expect(soundKeyNotice({ unavailable: ['Ctrl+Alt+9'], failed: false }, two, web)).toBeNull();
  });

  it('says so when sound keys could not be turned on at all', () => {
    expect(soundKeyNotice({ unavailable: [], failed: true }, two, desktop)).toEqual({
      title: "Sound keys aren't working",
      text: "Sound keys couldn't be turned on. You can still tap the buttons.",
    });
  });
});

describe('soundKeyTip', () => {
  it('suggests a good kind of key, and says games rarely use it only where keys work in games', () => {
    expect(soundKeyTip(web)).toBe('Tip: Ctrl + Alt + a number (like Ctrl + Alt + 1) makes a good sound key.');
    expect(soundKeyTip(desktop)).toBe('Tip: Ctrl + Alt + a number (like Ctrl + Alt + 1) makes a good sound key. Games rarely use those.');
  });

  it('uses the names this device uses', () => {
    expect(soundKeyTip({ global: false, os: 'mac' })).toBe('Tip: Ctrl + Option + a number (like Ctrl + Option + 1) makes a good sound key.');
  });
});

describe('unsupportedKeyText', () => {
  it('points her to keys that work', () => {
    expect(unsupportedKeyText('windows')).toBe("That key can't be used as a sound key. Try a letter, a number or an F key, held with Ctrl or Alt.");
    expect(unsupportedKeyText('mac')).toContain('held with Ctrl or Option.');
  });
});

describe('keyNote', () => {
  const honk = { kind: 'sound' as const, id: 'a' };
  const stop = { kind: 'stop' as const, id: 'stop-all' };

  it('gives a tip to a sound with no key, but not to Stop all', () => {
    expect(keyNote(data([sound('a', 'Honk', null)]), honk, null, web)).toEqual({ text: soundKeyTip(web), tone: 'ok' });
    expect(keyNote(data([sound('a', 'Honk', null)]), stop, null, web)).toBeNull();
  });

  it('has nothing to say about a good key', () => {
    expect(keyNote(data([sound('a', 'Honk', 'Ctrl+Alt+1')]), honk, 'Ctrl+Alt+1', desktop)).toBeNull();
  });

  it('warns about a key that is easy to press by mistake', () => {
    const note = keyNote(data([sound('a', 'Honk', 'H')]), honk, 'H', desktop);
    expect(note?.tone).toBe('warn');
    expect(note?.text).toMatch(/games and other apps won't get this key/);
  });

  it('says why a saved key does nothing', () => {
    const shared = data([sound('a', 'Honk', 'Ctrl+Alt+1'), sound('b', 'Beep', 'Ctrl+Alt+1')]);
    expect(keyNote(shared, { kind: 'sound', id: 'b' }, 'Ctrl+Alt+1', desktop)).toEqual({
      text: 'Already used by Honk, so this key does nothing yet. Pick another key.',
      tone: 'problem',
    });
    expect(keyNote(shared, honk, 'Ctrl+Alt+1', desktop)).toBeNull();
    const undo = data([sound('a', 'Honk', 'Ctrl+Z')]);
    expect(keyNote(undo, honk, 'Ctrl+Z', desktop)?.tone).toBe('problem');
  });
});
