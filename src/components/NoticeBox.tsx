import type { Notice } from '../audio/recorder/messages';

/** Something the recorder or the clipper wants her to know: a tip (hint) or something that went wrong (problem). */
export function NoticeBox({ notice }: { notice: Notice }) {
  if (notice.kind === 'problem') {
    return (
      <div className="ss-problem" role="alert">
        <span aria-hidden="true">⚠️</span>
        <div className="ss-message-body">{notice.text}</div>
      </div>
    );
  }
  return (
    <div className="ss-note" role="status">
      <span aria-hidden="true">💡</span>
      <div className="ss-message-body">{notice.text}</div>
    </div>
  );
}
