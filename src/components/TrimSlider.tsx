import type { CSSProperties } from 'react';
import { seconds, stamp } from '../audio/recorder/rules';

interface TrimSliderProps {
  id: string;
  label: string;
  /** Where the handle is, in milliseconds. */
  ms: number;
  /** The slider runs from here (the very start, unless the picture is zoomed in) to `toMs`. */
  fromMs?: number;
  toMs: number;
  /** How far an arrow key moves the handle, and how far Page Up and Page Down do. The browser's own step is far too big. */
  stepMs?: number;
  pageMs?: number;
  /** The Start slider is coloured the other way round: what comes after it is what is kept. */
  isStart?: boolean;
  disabled: boolean;
  /** What a screen reader says for where the handle is. */
  valueText?: (ms: number) => string;
  onChange: (ms: number) => void;
}

const MOVES: Partial<Record<string, { page: boolean; direction: 1 | -1 }>> = {
  ArrowRight: { page: false, direction: 1 },
  ArrowUp: { page: false, direction: 1 },
  ArrowLeft: { page: false, direction: -1 },
  ArrowDown: { page: false, direction: -1 },
  PageUp: { page: true, direction: 1 },
  PageDown: { page: true, direction: -1 },
};

const inSeconds = (ms: number): string => `${seconds(ms)} seconds`;

/** Start or End: slide to choose which part is kept. The picture above shows the same part. */
export function TrimSlider({
  id,
  label,
  ms,
  fromMs = 0,
  toMs,
  stepMs = 50,
  pageMs = 500,
  isStart = false,
  disabled,
  valueText = inSeconds,
  onChange,
}: TrimSliderProps) {
  const span = toMs - fromMs;
  const percent = span > 0 ? Math.min(100, Math.max(0, ((ms - fromMs) / span) * 100)) : 0;
  return (
    <div className="recorder-handle">
      <div className="recorder-handle-head">
        <label className="ss-field-label" htmlFor={id}>
          {label}
        </label>
        <span className="recorder-stamp" aria-hidden="true">
          {stamp(ms)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        className={isStart ? 'ss-range is-start' : 'ss-range'}
        min={fromMs}
        max={toMs}
        step="any"
        value={ms}
        disabled={disabled}
        style={{ '--fill': `${percent}%` } as CSSProperties}
        aria-valuetext={valueText(ms)}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        onKeyDown={(e) => {
          const move = MOVES[e.key];
          if (!move || e.altKey || e.ctrlKey || e.metaKey) return;
          e.preventDefault();
          const by = (move.page ? pageMs : stepMs) * move.direction;
          onChange(Math.min(toMs, Math.max(fromMs, ms + by)));
        }}
      />
    </div>
  );
}
