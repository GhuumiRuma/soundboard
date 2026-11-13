import { describe, expect, it } from 'vitest';
import { DecodedCache, decodedBytes } from './cache';
import { FakeBuffer } from '../test/webaudio';

// A one-channel buffer of n samples takes n * 4 bytes.
const buffer = (bytes: number, channels = 1) => new FakeBuffer(bytes / 4 / channels, channels);

describe('decoded sound memory', () => {
  it('counts every sample of every channel as 4 bytes', () => {
    expect(decodedBytes(new FakeBuffer(100, 2))).toBe(800);
  });

  it('remembers sounds and gives them back', () => {
    const cache = new DecodedCache<FakeBuffer>(1000);
    const a = buffer(100);
    cache.set('a', a);
    expect(cache.has('a')).toBe(true);
    expect(cache.get('a')).toBe(a);
    expect(cache.get('nope')).toBeUndefined();
    expect(cache.bytes).toBe(100);
    expect(cache.size).toBe(1);
  });

  it('lets go of the sound used longest ago when it is over its limit', () => {
    const cache = new DecodedCache<FakeBuffer>(300);
    cache.set('a', buffer(100));
    cache.set('b', buffer(100));
    cache.set('c', buffer(100));
    expect(cache.ids()).toEqual(['a', 'b', 'c']);
    cache.set('d', buffer(100));
    expect(cache.ids()).toEqual(['b', 'c', 'd']);
    expect(cache.bytes).toBe(300);
  });

  it('counts a played sound as used again, so it stays', () => {
    const cache = new DecodedCache<FakeBuffer>(300);
    cache.set('a', buffer(100));
    cache.set('b', buffer(100));
    cache.set('c', buffer(100));
    cache.get('a');
    cache.set('d', buffer(100));
    expect(cache.ids()).toEqual(['c', 'a', 'd']);
  });

  it('always keeps the newest sound, even when it is bigger than the whole limit', () => {
    const cache = new DecodedCache<FakeBuffer>(100);
    cache.set('small', buffer(40));
    cache.set('big', buffer(500));
    expect(cache.ids()).toEqual(['big']);
    expect(cache.bytes).toBe(500);
  });

  it('replaces a sound that is added again without counting it twice', () => {
    const cache = new DecodedCache<FakeBuffer>(1000);
    cache.set('a', buffer(100));
    cache.set('a', buffer(250));
    expect(cache.bytes).toBe(250);
    expect(cache.size).toBe(1);
  });

  it('forgets one sound, or all of them', () => {
    const cache = new DecodedCache<FakeBuffer>(1000);
    cache.set('a', buffer(100));
    cache.set('b', buffer(200));
    cache.delete('a');
    cache.delete('never-there');
    expect(cache.bytes).toBe(200);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.bytes).toBe(0);
  });
});
