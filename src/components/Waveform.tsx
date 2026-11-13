import { useMemo } from 'react';

/** The picture is 240 bars wide and this tall; it is stretched to fit the box. */
const HEIGHT = 64;
/** Even the quietest part gets a thin line, so the picture never has gaps. */
const THINNEST = 2;
const MARGIN = 2;

interface WaveformProps {
  /** How loud each part of the recording is, 0 to 1. */
  bars: readonly number[];
  lengthMs: number;
  startMs: number;
  endMs: number;
  /** Whether anything is cut off. The Start and End lines only show then. */
  trimmed: boolean;
  /** What a screen reader says for the picture. */
  label: string;
}

/** The bars that are kept sit in one path and the bars that are cut off in another, so there are only two shapes to draw. */
function barPaths(bars: readonly number[], lengthMs: number, startMs: number, endMs: number): { kept: string; cut: string } {
  let kept = '';
  let cut = '';
  const count = bars.length;
  for (let i = 0; i < count; i++) {
    const height = Math.max(THINNEST, bars[i] * (HEIGHT - MARGIN * 2));
    const piece = `M${i + 0.5} ${((HEIGHT - height) / 2).toFixed(2)}v${height.toFixed(2)}`;
    const middle = ((i + 0.5) / count) * lengthMs;
    if (middle >= startMs && middle <= endMs) kept += piece;
    else cut += piece;
  }
  return { kept, cut };
}

/** A picture of the recording: loud parts tall, quiet parts short, with the part that is kept in the accent colour. */
export function Waveform({ bars, lengthMs, startMs, endMs, trimmed, label }: WaveformProps) {
  const { kept, cut } = useMemo(() => barPaths(bars, lengthMs, startMs, endMs), [bars, lengthMs, startMs, endMs]);
  const count = bars.length;
  const place = (ms: number) => (lengthMs > 0 ? (ms / lengthMs) * count : 0);

  return (
    <svg className="waveform" viewBox={`0 0 ${count} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={label} focusable="false">
      <path className="waveform-cut" d={cut} />
      <path className="waveform-kept" d={kept} />
      {trimmed && (
        <>
          <line className="waveform-edge" x1={place(startMs)} x2={place(startMs)} y1="0" y2={HEIGHT} />
          <line className="waveform-edge" x1={place(endMs)} x2={place(endMs)} y1="0" y2={HEIGHT} />
        </>
      )}
    </svg>
  );
}
