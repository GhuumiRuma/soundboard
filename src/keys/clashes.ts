import type { DeviceOs } from '../lib/device';
import type { BoardsData } from '../model/types';
import { formatKey, isBrowserKey, normalizeKeyString, safeKeyAdvice } from './keyString';

/** Where the key will be used. `global` is true in the Windows and Mac installers, where keys work in every app. */
export interface KeyPlace {
  global: boolean;
  os?: DeviceOs;
}

export const STOP_ALL_NAME = 'Stop all sounds';

/** Something that can have a key: one of her sounds, or the Stop all sounds button. */
export interface KeyOwner {
  kind: 'sound' | 'stop';
  /** The sound's id. For Stop all it is only a label, so use `kind` to tell them apart. */
  id: string;
  /** What she calls it. */
  name: string;
  /** The saved key, like "Ctrl+Alt+1". */
  key: string;
}

export type KeyOwnerRef = Pick<KeyOwner, 'kind' | 'id'>;

export const STOP_ALL: KeyOwnerRef = { kind: 'stop', id: 'stop-all' };

const sameOwner = (a: KeyOwnerRef, b: KeyOwnerRef) => a.kind === b.kind && a.id === b.id;

/** Everything that has a key, with Stop all first and then her sounds in the order she sees them. */
export function keyOwners(data: BoardsData): KeyOwner[] {
  const owners: KeyOwner[] = [];
  const stop = normalizeKeyString(data.stopAllKey);
  if (stop) owners.push({ ...STOP_ALL, name: STOP_ALL_NAME, key: stop });
  for (const board of data.boards) {
    for (const sound of board.sounds) {
      const key = normalizeKeyString(sound.hotkey);
      if (key) owners.push({ kind: 'sound', id: sound.id, name: sound.name, key });
    }
  }
  return owners;
}

/** Ctrl+Z (and Cmd+Z on a Mac) is Undo. */
function isUndoKey(key: string): boolean {
  return key === 'Ctrl+Z' || key === 'Meta+Z';
}

/**
 * Why a key can never play a sound here, in plain words, or null when it is free to use.
 * Undo always keeps its key. A browser keeps its own keys too (Ctrl+W and friends), but the installers don't have that problem.
 */
export function reservedReason(key: string, where: KeyPlace): string | null {
  const normalized = normalizeKeyString(key);
  if (!normalized) return "That key can't be used as a sound key.";
  const shown = formatKey(normalized, where.os);
  if (isUndoKey(normalized)) return `${shown} is for Undo, so a sound can't use it.`;
  if (!where.global && isBrowserKey(normalized)) {
    return `Your browser keeps ${shown} for itself, so a sound can't use it. ${safeKeyAdvice(where.os)} is a good choice.`;
  }
  return null;
}

/**
 * Why this key can't be given to `self`, or null when it can. This is what the key recorder asks before it accepts a key.
 * A key already used by something else is refused, and the message says by what.
 */
export function soundKeyProblem(data: BoardsData, key: string, self: KeyOwnerRef, where: KeyPlace): string | null {
  const reserved = reservedReason(key, where);
  if (reserved) return reserved;
  const normalized = normalizeKeyString(key);
  const other = keyOwners(data).find((o) => o.key === normalized && !sameOwner(o, self));
  return other ? `Already used by ${other.name}.` : null;
}

export interface KeyPlan {
  /** The keys that will work. When two things share a key (a backup can bring that in), the first one gets it. */
  active: KeyOwner[];
  /** The ones that lost a tie, with the owner that won it. */
  shadowed: { owner: KeyOwner; winner: KeyOwner }[];
  /** The ones that can't work at all, like a sound that was given Ctrl+Z. */
  blocked: { owner: KeyOwner; reason: string }[];
}

export function planKeys(data: BoardsData, where: KeyPlace): KeyPlan {
  const plan: KeyPlan = { active: [], shadowed: [], blocked: [] };
  const winners = new Map<string, KeyOwner>();
  for (const owner of keyOwners(data)) {
    const reason = reservedReason(owner.key, where);
    if (reason) {
      plan.blocked.push({ owner, reason });
      continue;
    }
    const winner = winners.get(owner.key);
    if (winner) {
      plan.shadowed.push({ owner, winner });
    } else {
      winners.set(owner.key, owner);
      plan.active.push(owner);
    }
  }
  return plan;
}

/** What to tell her about a key that was saved but will not work, or null when it works. */
export function brokenKeyNote(plan: KeyPlan, self: KeyOwnerRef): string | null {
  const lost = plan.shadowed.find((s) => sameOwner(s.owner, self));
  if (lost) return `Already used by ${lost.winner.name}, so this key does nothing yet. Pick another key.`;
  const blocked = plan.blocked.find((b) => sameOwner(b.owner, self));
  return blocked ? `${blocked.reason} Pick another key.` : null;
}
