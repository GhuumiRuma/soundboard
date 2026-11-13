import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';

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
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={['ss-dialog', sheet ? 'is-sheet' : '', className ?? ''].filter(Boolean).join(' ')}
      aria-labelledby={titleId}
      onClose={() => {
        // Only a close she asked for (Escape) needs telling: our own close() already knows.
        if (shouldBeOpen.current) onClose();
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
