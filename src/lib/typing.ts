/**
 * True when a key press is meant for a box she is typing in (a text field, a drop-down, anything she can edit), or for
 * the key recorder. Sound keys and Ctrl+Z leave those alone.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest('[data-captures-keys]')) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'range', 'file', 'submit', 'reset', 'color', 'image'].includes(type);
  }
  return false;
}
