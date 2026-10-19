import { useId, useState } from 'react';
import { cx } from '@foodcourt/ui';

// Single-series charts in the brand saffron (validated: lightness band, chroma, contrast vs
// surface). Marks stay thin, data ends are rounded 4px, labels use ink tokens, never the
// series colour. One series means no legend; the title names it.

export function Sparkline({ values, label, height = 44 }: { values: number[]; label: string; height?: number }) {
  const gradientId = useId();
  const width = 240;
  if (values.length < 2 || values.every((v) => v === 0)) {
    return <p className="text-sm text-ink-3">The trend appears once orders come in.</p>;
  }
  const max = Math.max(...values);
  const step = width / (values.length - 1);
  const points = values.map((v, i) => [i * step, height - 4 - (v / max) * (height - 8)] as const);
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = points[points.length - 1]!;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-11 w-full overflow-visible" role="img" aria-label={label}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.22" />
          <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke="rgb(var(--accent))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r="4" fill="rgb(var(--accent))" stroke="rgb(var(--surface))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

interface Bar {
  key: string;
  label: string;
  value: number;
  display: string;
}

// Vertical bars with a recessive grid and a per-bar hover tooltip.
export function HourBars({ bars, title }: { bars: Bar[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const ticks = [max, Math.round(max / 2), 0];

  if (bars.every((b) => b.value === 0)) {
    return <p className="py-16 text-center text-sm text-ink-3">No orders yet today. Bars appear hour by hour as diners order.</p>;
  }

  return (
    <figure aria-label={title} className="relative">
      <div className="grid grid-cols-[2rem_1fr] gap-3">
        <div className="flex h-56 flex-col justify-between pb-6 text-right text-2xs tabular-nums text-ink-3" aria-hidden>
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="relative h-56">
          <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className={cx('block h-px', t === 0 ? 'bg-line-strong' : 'bg-line/70')} />
            ))}
          </div>
          <ol className="absolute inset-x-0 top-0 bottom-6 flex items-end gap-[2px]">
            {bars.map((bar, i) => (
              <li
                key={bar.key}
                className="group relative flex h-full flex-1 items-end"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                aria-label={`${bar.label}: ${bar.display}`}
              >
                <span
                  className={cx(
                    'block w-full rounded-t-[4px] transition-[opacity,background-color] duration-150',
                    hover === null || hover === i ? 'bg-accent' : 'bg-accent/35'
                  )}
                  style={{ height: `${Math.max(bar.value > 0 ? 3 : 0, (bar.value / max) * 100)}%` }}
                />
                {hover === i && (
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-[1] mb-2 -translate-x-1/2 whitespace-nowrap rounded-field bg-ink px-2.5 py-1.5 text-xs text-surface shadow-float">
                    <span className="block text-surface/70">{bar.label}</span>
                    <span className="block font-semibold tabular-nums">{bar.display}</span>
                  </span>
                )}
              </li>
            ))}
          </ol>
          <ol className="absolute inset-x-0 bottom-0 flex h-5 gap-[2px] text-2xs text-ink-3" aria-hidden>
            {bars.map((bar, i) => (
              <li key={bar.key} className="flex-1 text-center">
                {i % 2 === 0 || bars.length <= 8 ? bar.label : ''}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </figure>
  );
}

// Horizontal share bars: the label and value sit in ink beside a saffron bar.
export function ShareBars({ rows }: { rows: Array<{ key: string; label: string; value: number; display: string }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-ink">{row.label}</span>
            <span className="font-semibold tabular-nums text-ink">{row.display}</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2" title={`${row.label}: ${row.display}`}>
            <span
              className="block h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
              style={{ width: `${row.value === 0 ? 0 : Math.max(2, (row.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
