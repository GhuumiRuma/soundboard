import { useSyncExternalStore } from 'react';

/** Phones are narrower than this. The small-screen rules in the stylesheets use the same width. */
export const PHONE_QUERY = '(max-width: 719.98px)';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useIsPhone = (): boolean => useMediaQuery(PHONE_QUERY);

export const usePrefersReducedMotion = (): boolean => useMediaQuery('(prefers-reduced-motion: reduce)');
