/**
 * After the edit card closes, puts the keyboard cursor somewhere sensible instead of letting it fall back to the
 * top of the page. Does nothing if she has already moved on to something else.
 */
export function restoreFocusAfterEditor(soundId: string): void {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const target =
      document.querySelector<HTMLElement>(`[data-edit-for="${CSS.escape(soundId)}"]`) ??
      document.querySelector<HTMLElement>('.sound-tile') ??
      document.getElementById('board-panel');
    target?.focus();
  });
}

/** Everything the Tab key can stop on. */
const TAB_STOPS = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Call just before a message is taken off the page, while it is still there. A button that goes away takes the
 * keyboard cursor with it, which leaves her at the top of the page again. This hands the cursor to the next button
 * after the message instead, or the one just before it when the message was last. Does nothing if she has already
 * moved on.
 */
export function keepFocusAfterRemoving(message: Element): void {
  const others = Array.from(document.querySelectorAll<HTMLElement>(TAB_STOPS)).filter(
    (el) => !message.contains(el) && el.getClientRects().length > 0,
  );
  const after = others.filter((el) => (message.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
  const before = others.filter((el) => (message.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) !== 0).reverse();
  const candidates = [...after, ...before];
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    for (const el of candidates) {
      el.focus();
      if (document.activeElement === el) return;
    }
  });
}
