import { useEffect } from 'react';
import { isTypingTarget } from '../lib/typing';
import { getBoardStore } from '../state';

/** Ctrl+Z (Cmd+Z on a Mac) takes back the last thing she did, as long as she isn't typing in a box. */
export function useUndoShortcut(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || isTypingTarget(e.target)) return;
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
      if (getBoardStore().undo.undoLatest()) e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
