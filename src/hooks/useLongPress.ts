import { useCallback, useEffect, useRef, type PointerEvent } from 'react';

/** How long a finger has to stay down on a sound button to open its edit card. */
export const LONG_PRESS_MS = 500;
const MOVE_LIMIT_PX = 10;

/**
 * Press and hold with a finger or pen. A mouse uses right-click instead.
 * After a long press the click that follows is not a tap, so call `wasLongPress()` first thing in the click handler.
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const latest = useRef(onLongPress);

  useEffect(() => {
    latest.current = onLongPress;
  });

  const cancel = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    origin.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      fired.current = false;
      if (e.pointerType === 'mouse') return;
      cancel();
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        fired.current = true;
        latest.current();
      }, LONG_PRESS_MS);
    },
    [cancel],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const start = origin.current;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_LIMIT_PX) cancel();
    },
    [cancel],
  );

  const wasLongPress = useCallback(() => {
    const was = fired.current;
    fired.current = false;
    return was;
  }, []);

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp: cancel, onPointerCancel: cancel, onPointerLeave: cancel },
    wasLongPress,
  };
}
