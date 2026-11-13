import { create } from 'zustand';
import { getPlatform } from '../platform';

/**
 * Light / dark look. What she picks is Dark, Light or System; the theme that picks is written to <html data-theme>
 * so the colour tokens in styles/tokens.css can swap.
 *
 * index.html repeats the "which theme?" step in a small inline script so the very first paint already has the right
 * colours. If the storage key, the default or the background colours change here, change them there too.
 */
export type Theme = 'light' | 'dark';
export type ThemePref = Theme | 'system';

export const THEME_KEY = 'soundboard-theme';
export const DEFAULT_PREF: ThemePref = 'system';

/** The page background of each theme (--app-bg in tokens.css). It tints the browser bar and the phone's status bar. */
export const THEME_COLORS: Record<Theme, string> = { dark: '#111018', light: '#faf8ff' };

export function parsePref(raw: string | null | undefined): ThemePref {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : DEFAULT_PREF;
}

export function resolveTheme(pref: ThemePref, systemIsLight: boolean): Theme {
  return pref === 'system' ? (systemIsLight ? 'light' : 'dark') : pref;
}

interface ThemeState {
  pref: ThemePref;
  /** What is actually showing. */
  theme: Theme;
}

const systemQuery = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: light)')
    : null;

function readPref(): ThemePref {
  try {
    return parsePref(localStorage.getItem(THEME_KEY));
  } catch {
    return DEFAULT_PREF;
  }
}

function initialState(): ThemeState {
  const pref = readPref();
  return { pref, theme: resolveTheme(pref, !!systemQuery()?.matches) };
}

export const useTheme = create<ThemeState>()(initialState);

function setMeta(name: string, content: string) {
  document.querySelector(`meta[name="${name}"]`)?.setAttribute('content', content);
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  setMeta('theme-color', THEME_COLORS[theme]);
  setMeta('color-scheme', theme);
  getPlatform().setTheme?.(theme);
}

function commit(pref: ThemePref) {
  const theme = resolveTheme(pref, !!systemQuery()?.matches);
  useTheme.setState({ pref, theme });
  applyTheme(theme);
}

/** Saves and applies her choice. */
export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Storage can be blocked or full. The choice then lasts until the app closes.
  }
  commit(pref);
}

let started = false;

/** Applies the saved theme and makes "System" follow the device. Call once at start-up, after the platform is ready. */
export function initTheme() {
  if (started) return;
  started = true;
  applyTheme(useTheme.getState().theme);
  systemQuery()?.addEventListener('change', () => {
    if (useTheme.getState().pref === 'system') commit('system');
  });
}
