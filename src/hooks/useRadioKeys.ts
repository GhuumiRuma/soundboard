import { useRef, type KeyboardEvent } from 'react';

/**
 * Keyboard use for a set of choices (emoji, colours): one Tab stop, then the arrow keys pick.
 * Spread `groupProps` on the container and `itemProps(i)` on each choice.
 */
export function useRadioKeys(count: number, selectedIndex: number, select: (index: number) => void) {
  const items = useRef<(HTMLElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const from = items.current.findIndex((el) => el === document.activeElement);
    if (from < 0 || count === 0) return;
    let to: number;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        to = (from + 1) % count;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        to = (from - 1 + count) % count;
        break;
      case 'Home':
        to = 0;
        break;
      case 'End':
        to = count - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    select(to);
    items.current[to]?.focus();
  };

  return {
    groupProps: { onKeyDown },
    itemProps: (index: number) => ({
      ref: (el: HTMLElement | null) => {
        items.current[index] = el;
      },
      tabIndex: (selectedIndex >= 0 ? index === selectedIndex : index === 0) ? 0 : -1,
    }),
  };
}
