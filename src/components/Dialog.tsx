import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { registerOpenDialog } from './dialogStack';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** On a phone the box slides up from the bottom, like a sheet. */
  sheet?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * A pop-up box. It uses the browser's own dialog, which keeps the page behind it still,
 * keeps the Tab key inside, and closes on Escape.
 *
 * Asking to close is not the same as closing: the box that holds a recording, for example, asks "Throw this
 * recording away?" first. So Escape and the backdrop only call `onClose`, and the box shuts when the page says `open` is false.
 */
export function Dialog({ open, title, onClose, sheet = false, className, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pressedOnBackdrop = useRef(false);
  const shouldBeOpen = useRef(open);

  useLayoutEffect(() => {
    shouldBeOpen.current = open;
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
    // The messages at the bottom of the screen move into the box that is on top, so a box never hides them.
    return open ? registerOpenDialog(dialog) : undefined;
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={['ss-dialog', sheet ? 'is-sheet' : '', className ?? ''].filter(Boolean).join(' ')}
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        // Escape asks to close. Handling the key here means the browser never closes the box on its own for it.
        if (e.key !== 'Escape' || e.defaultPrevented || e.nativeEvent.isComposing) return;
        e.preventDefault();
        onClose();
      }}
      onCancel={(e) => {
        // Any other way the browser asks to close (like Android's Back): keep the box open and let the page decide.
        if (!e.cancelable) return;
        e.preventDefault();
        onClose();
      }}
      onClose={() => {
        // The browser shut the box anyway (it won't let a Back gesture be refused twice in a row). Tell the page, and
        // if it wants the box to stay open, open it again.
        if (!shouldBeOpen.current) return;
        onClose();
        window.setTimeout(() => {
          const dialog = ref.current;
          if (dialog && shouldBeOpen.current && !dialog.open) dialog.showModal();
        }, 0);
      }}
      onPointerDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const onBackdrop = pressedOnBackdrop.current && e.target === e.currentTarget;
        pressedOnBackdrop.current = false;
        if (onBackdrop) onClose();
      }}
    >
      {open && (
        <>
          <div className="ss-dialog-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Close
            </button>
          </div>
          <div className="ss-dialog-body">{children}</div>
        </>
      )}
    </dialog>
  );
}
