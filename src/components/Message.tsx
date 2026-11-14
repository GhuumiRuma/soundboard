import { useLayoutEffect, useRef, type ComponentProps } from 'react';
import { keepFocusAfterRemoving } from '../lib/focus';

/**
 * The box a message on the page sits in: a note, a warning, something that went wrong, the Undo bar. If it goes
 * away while the keyboard cursor is on one of its buttons (she pressed Not now, say), the cursor moves on to the
 * nearest button instead of being lost.
 */
export function Message(props: Omit<ComponentProps<'div'>, 'ref'>) {
  const box = useRef<HTMLDivElement>(null);

  // React runs this just before the box is taken off the page, while the cursor can still be found inside it.
  useLayoutEffect(() => {
    const element = box.current;
    return () => {
      if (element?.contains(document.activeElement)) keepFocusAfterRemoving(element);
    };
  }, []);

  return <div {...props} ref={box} />;
}
