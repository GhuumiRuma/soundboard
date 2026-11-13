import { describe, expect, it } from 'vitest';
import type { BoardsData, SoundItem } from '../model/types';
import { STOP_ALL, brokenKeyNote, keyOwners, planKeys, reservedReason, soundKeyProblem } from './clashes';

const web = { global: false, os: 'windows' as const };
const desktop = { global: true, os: 'windows' as const };

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

function boards(options: { stop?: string | null; first?: SoundItem[]; second?: SoundItem[] } = {}): BoardsData {
  return {
    boards: [
      { id: 'b1', name: 'My sounds', sounds: options.first ?? [] },
      { id: 'b2', name: 'Memes', sounds: options.second ?? [] },
    ],
    masterVolume: 1,
    stopAllKey: options.stop ?? null,
  };
}

describe('keyOwners', () => {
  it('lists Stop all first, then the sounds in the order she sees them', () => {
    const data = boards({
      stop: 'ctrl+alt+0',
      first: [sound('a', 'Honk', 'Ctrl+Alt+1'), sound('b', 'Quiet one', null)],
      second: [sound('c', 'Boom', 'alt+2')],
    });
    expect(keyOwners(data)).toEqual([
      { kind: 'stop', id: 'stop-all', name: 'Stop all sounds', key: 'Ctrl+Alt+0' },
      { kind: 'sound', id: 'a', name: 'Honk', key: 'Ctrl+Alt+1' },
      { kind: 'sound', id: 'c', name: 'Boom', key: 'Alt+2' },
    ]);
  });

  it('ignores things with no key, and text that is not a key', () => {
    expect(keyOwners(boards({ first: [sound('a', 'Honk', null), sound('b', 'Beep', 'nonsense')] }))).toEqual([]);
  });
});

describe('soundKeyProblem', () => {
  const data = boards({ stop: 'Ctrl+Alt+0', first: [sound('a', 'Honk', 'Ctrl+Alt+1')], second: [sound('c', 'Boom', 'Ctrl+Alt+2')] });
  const honk = { kind: 'sound' as const, id: 'a' };

  it('lets a key through when nothing else uses it', () => {
    expect(soundKeyProblem(data, 'Ctrl+Alt+3', honk, web)).toBeNull();
  });

  it("lets a sound keep the key it already has (it isn't a clash with itself)", () => {
    expect(soundKeyProblem(data, 'Ctrl+Alt+1', honk, web)).toBeNull();
  });

  it('says what already uses a key, even on another board', () => {
    expect(soundKeyProblem(data, 'Ctrl+Alt+2', honk, web)).toBe('Already used by Boom.');
  });

  it('counts the Stop all key as something that uses a key', () => {
    expect(soundKeyProblem(data, 'Ctrl+Alt+0', honk, web)).toBe('Already used by Stop all sounds.');
    expect(soundKeyProblem(data, 'Ctrl+Alt+1', STOP_ALL, web)).toBe('Already used by Honk.');
    expect(soundKeyProblem(data, 'Ctrl+Alt+0', STOP_ALL, web)).toBeNull();
  });

  it('spots a clash however the other key was written down', () => {
    expect(soundKeyProblem(boards({ first: [sound('a', 'Honk', 'alt + ctrl + 1')] }), 'Ctrl+Alt+1', { kind: 'sound', id: 'z' }, web)).toBe(
      'Already used by Honk.',
    );
  });

  it('keeps Ctrl+Z and Cmd+Z for Undo', () => {
    expect(soundKeyProblem(data, 'Ctrl+Z', honk, web)).toBe("Ctrl + Z is for Undo, so a sound can't use it.");
    expect(soundKeyProblem(data, 'Meta+Z', honk, { global: false, os: 'mac' })).toBe("Cmd + Z is for Undo, so a sound can't use it.");
    expect(soundKeyProblem(data, 'Ctrl+Shift+Z', honk, web)).toBeNull();
  });

  it('refuses keys a browser keeps for itself, but only in a browser', () => {
    expect(soundKeyProblem(data, 'Ctrl+W', honk, web)).toMatch(/^Your browser keeps Ctrl \+ W for itself/);
    expect(soundKeyProblem(data, 'Ctrl+W', honk, desktop)).toBeNull();
  });

  it('refuses text that is not a key', () => {
    expect(soundKeyProblem(data, 'nonsense', honk, web)).toBe("That key can't be used as a sound key.");
  });
});

describe('reservedReason', () => {
  it('suggests a good key in the words of this device', () => {
    expect(reservedReason('Ctrl+T', { global: false, os: 'mac' })).toMatch(/Ctrl \+ Option \+ a number is a good choice\.$/);
    expect(reservedReason('Ctrl+T', web)).toMatch(/Ctrl \+ Alt \+ a number is a good choice\.$/);
  });
});

describe('planKeys', () => {
  it('gives each key to the first thing that has it, Stop all before sounds', () => {
    const data = boards({
      stop: 'Ctrl+Alt+1',
      first: [sound('a', 'Honk', 'Ctrl+Alt+1'), sound('b', 'Beep', 'Ctrl+Alt+2')],
      second: [sound('c', 'Boom', 'ctrl+alt+2')],
    });
    const plan = planKeys(data, web);
    expect(plan.active.map((o) => o.name)).toEqual(['Stop all sounds', 'Beep']);
    expect(plan.shadowed.map((s) => [s.owner.name, s.winner.name])).toEqual([
      ['Honk', 'Stop all sounds'],
      ['Boom', 'Beep'],
    ]);
    expect(plan.blocked).toEqual([]);
  });

  it('never registers Undo, so a backup cannot take Ctrl+Z from every app', () => {
    const data = boards({ first: [sound('a', 'Honk', 'Ctrl+Z'), sound('b', 'Beep', 'Meta+Z')], second: [sound('c', 'Boom', 'Ctrl+Alt+2')] });
    for (const where of [web, desktop]) {
      const plan = planKeys(data, where);
      expect(plan.active.map((o) => o.name)).toEqual(['Boom']);
      expect(plan.blocked.map((b) => b.owner.name)).toEqual(['Honk', 'Beep']);
    }
  });

  it('only blocks browser keys in a browser', () => {
    const data = boards({ first: [sound('a', 'Honk', 'Ctrl+W')] });
    expect(planKeys(data, web).active).toEqual([]);
    expect(planKeys(data, web).blocked).toHaveLength(1);
    expect(planKeys(data, desktop).active.map((o) => o.name)).toEqual(['Honk']);
  });

  it('is empty when nothing has a key', () => {
    expect(planKeys(boards({ first: [sound('a', 'Honk', null)] }), web)).toEqual({ active: [], shadowed: [], blocked: [] });
  });
});

describe('brokenKeyNote', () => {
  it('explains why a saved key does nothing', () => {
    const data = boards({ first: [sound('a', 'Honk', 'Ctrl+Alt+1'), sound('b', 'Beep', 'Ctrl+Alt+1'), sound('c', 'Boom', 'Ctrl+Z')] });
    const plan = planKeys(data, web);
    expect(brokenKeyNote(plan, { kind: 'sound', id: 'a' })).toBeNull();
    expect(brokenKeyNote(plan, { kind: 'sound', id: 'b' })).toBe('Already used by Honk, so this key does nothing yet. Pick another key.');
    expect(brokenKeyNote(plan, { kind: 'sound', id: 'c' })).toBe("Ctrl + Z is for Undo, so a sound can't use it. Pick another key.");
    expect(brokenKeyNote(plan, STOP_ALL)).toBeNull();
  });
});
