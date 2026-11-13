import type { CSSProperties } from 'react';

interface VolumeSliderProps {
  id: string;
  /** 0 to 1 */
  value: number;
  onChange: (value: number) => void;
}

/** A slider from 0% to 100% with the number beside it. Give it a label that points at `id`. */
export function VolumeSlider({ id, value, onChange }: VolumeSliderProps) {
  const percent = Math.round(value * 100);
  return (
    <div className="ss-slider-row">
      <input
        id={id}
        type="range"
        className="ss-range"
        min={0}
        max={100}
        step={1}
        value={percent}
        style={{ '--fill': `${percent}%` } as CSSProperties}
        aria-valuetext={`${percent}%`}
        onChange={(e) => onChange(Number(e.currentTarget.value) / 100)}
      />
      <span className="ss-percent" aria-hidden="true">
        {percent}%
      </span>
    </div>
  );
}
