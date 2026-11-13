import { useLayoutEffect, type RefObject } from 'react';

/**
 * Tells the stylesheet how tall the phone's bottom bar is (as --bar-height), so messages float just above it.
 * Set through the page's style object, which the desktop app's strict security rules allow.
 */
export function useBarHeight(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const element = ref.current;
    if (!active || !element) {
      root.style.removeProperty('--bar-height');
      return;
    }
    const update = () => root.style.setProperty('--bar-height', `${element.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--bar-height');
    };
  }, [ref, active]);
}
