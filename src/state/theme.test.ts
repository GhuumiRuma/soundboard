import { describe, expect, it } from 'vitest';
import { DEFAULT_PREF, THEME_COLORS, parsePref, resolveTheme } from './theme';

describe('theme preference', () => {
  it('reads the three choices and ignores anything else', () => {
    expect(parsePref('light')).toBe('light');
    expect(parsePref('dark')).toBe('dark');
    expect(parsePref('system')).toBe('system');
    expect(parsePref('purple')).toBe(DEFAULT_PREF);
    expect(parsePref('')).toBe(DEFAULT_PREF);
    expect(parsePref(null)).toBe(DEFAULT_PREF);
    expect(parsePref(undefined)).toBe(DEFAULT_PREF);
  });

  it('follows the device only when set to System', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
  });

  it('uses the StreamStudio background colours', () => {
    expect(THEME_COLORS.dark).toBe('#111018');
    expect(THEME_COLORS.light).toBe('#faf8ff');
  });
});
