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
