import { useEffect, useState, useSyncExternalStore } from 'react';
import { getPlatform } from '../platform';
import { getBoardStore, useBoard, type UndoOffer } from '../state';

function useSecondsLeft(expiresAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

/** "Deleted “Airhorn”" with an Undo button and a countdown. Same shape as StreamStudio's. */
function UndoBar({ offer }: { offer: UndoOffer }) {
  const undo = getBoardStore().undo;
  const seconds = useSecondsLeft(offer.expiresAt);
  const more = offer.pending - 1;
  const shortcut = getPlatform().os === 'mac' ? '⌘Z' : 'Ctrl+Z';
  return (
    <div className="ss-undo">
      <span className="ss-undo-message">{offer.message}</span>
      {more > 0 && <span className="ss-undo-more">(+{more} more)</span>}
      <button type="button" className="btn btn-accent" title={`Undo (${shortcut})`} onClick={() => undo.undoLatest()}>
        Undo
      </button>
      <span className="ss-undo-seconds" aria-hidden="true">
        {seconds} s
      </span>
      <button type="button" className="ss-undo-close" aria-label="Dismiss" onClick={() => undo.dismiss()}>
        ×
      </button>
    </div>
  );
}

/**
 * The messages that float at the bottom: things that went wrong, a short "Moved it" note, and the Undo bar.
 * The box is always on the page so screen readers read out what appears in it.
 */
export function Toasts() {
  const store = getBoardStore();
  const problems = useBoard((s) => s.problems);
  const notice = useBoard((s) => s.notice);
  const offer = useSyncExternalStore(store.undo.subscribe, store.undo.getOffer);

  return (
    <div className="ss-toasts" aria-live="polite">
      {problems.map((message, i) => (
        <div className="ss-problem" key={message}>
          <span aria-hidden="true">⚠️</span>
          <div className="ss-message-body">{message}</div>
          <button type="button" className="ss-message-close" aria-label="Dismiss message" onClick={() => store.dismissProblem(i)}>
            ×
          </button>
        </div>
      ))}
      {notice && <div className="ss-toast">{notice}</div>}
      {offer && <UndoBar offer={offer} />}
    </div>
  );
}
