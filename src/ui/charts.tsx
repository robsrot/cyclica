/**
 * Minimal, honest charts.
 *  - Value axes start at zero (no exaggerated differences).
 *  - Periods without data are drawn as "no data", never as zero.
 *  - Every chart states its period and sample size, and has a table alternative for VoiceOver.
 */
import { useId } from 'react';

export interface Bar {
  label: string;
  value: number | null;
  /** Sample size behind this bar (e.g. tracked days). */
  n: number;
  tooltip?: string;
}

export function BarChart({
  title,
  caption,
  bars,
  max,
  format,
  unit,
  color = 'var(--color-sage)',
}: {
  title: string;
  caption: string;
  bars: Bar[];
  max: number;
  format: (v: number) => string;
  unit: string;
  color?: string;
}) {
  const id = useId();
  const W = 320;
  const H = 150;
  const top = 14;
  const bottom = 26;
  const left = 30;
  const plotH = H - top - bottom;
  const bw = (W - left - 4) / Math.max(bars.length, 1);
  const ticks = [0, max / 2, max];
  const showEvery = bars.length > 14 ? Math.ceil(bars.length / 7) : 1;
  const summary = bars
    .map((b) => `${b.label}: ${b.value === null ? 'no data' : `${format(b.value)} (n=${b.n})`}`)
    .join('; ');

  return (
    <figure className="flex flex-col gap-1" aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`} className="font-semibold">
        {title}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${title}. ${caption}. ${summary}`}>
        {ticks.map((t) => {
          const y = top + plotH - (t / max) * plotH;
          return (
            <g key={t}>
              <line x1={left} x2={W - 2} y1={y} y2={y} stroke="var(--color-line)" strokeWidth={1} />
              <text x={left - 4} y={y + 3} textAnchor="end" fontSize="9" fill="var(--color-ink-soft)">
                {format(t)}
              </text>
            </g>
          );
        })}
        {bars.map((b, i) => {
          const x = left + i * bw + bw * 0.15;
          const w = bw * 0.7;
          if (b.value === null) {
            return (
              <g key={i}>
                <rect x={x} y={top + plotH - 6} width={w} height={6} fill="none" stroke="var(--color-ink-soft)" strokeDasharray="2 2" />
                {i % showEvery === 0 && (
                  <text x={x + w / 2} y={H - 12} textAnchor="middle" fontSize="8.5" fill="var(--color-ink-soft)">
                    {b.label}
                  </text>
                )}
              </g>
            );
          }
          const h = Math.max(1, (Math.min(b.value, max) / max) * plotH);
          return (
            <g key={i}>
              <rect x={x} y={top + plotH - h} width={w} height={h} rx={2} fill={color}>
                <title>{`${b.label}: ${format(b.value)} (n=${b.n})${b.tooltip ? ` · ${b.tooltip}` : ''}`}</title>
              </rect>
              {i % showEvery === 0 && (
                <text x={x + w / 2} y={H - 12} textAnchor="middle" fontSize="8.5" fill="var(--color-ink-soft)">
                  {b.label}
                </text>
              )}
              {bars.length <= 12 && (
                <text x={x + w / 2} y={H - 2} textAnchor="middle" fontSize="7.5" fill="var(--color-ink-soft)">
                  n={b.n}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-ink-soft">
        {caption} Dashed outline = no data recorded. {unit}
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer text-sage-deep">Show as table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-ink-soft">
              <th className="font-semibold">Period</th>
              <th className="font-semibold">Value</th>
              <th className="font-semibold">Based on</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((b, i) => (
              <tr key={i} className="border-t border-line">
                <td>{b.label}</td>
                <td>{b.value === null ? 'no data' : format(b.value)}</td>
                <td>n={b.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
