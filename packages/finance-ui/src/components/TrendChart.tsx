import { useEffect, useMemo, useRef, useState } from 'react';
import type { Granularity } from '@foodcourt/shared';
import { bucketLabel, bucketTitle } from '../lib/format';

interface TrendChartProps {
  points: Array<{ key: string; value: number }>;
  granularity: Granularity;
  /** Full value for the tooltip and the table view, e.g. ₹1,240.50 or "12 orders". */
  format: (v: number) => string;
  /** Short value for the axis, e.g. ₹1.2k. */
  axis: (v: number) => string;
  label: string;
  height?: number;
}

const PAD = { top: 14, right: 8, bottom: 30, left: 56 };

/** A clean ceiling and step so the grid reads 0 / 2k / 4k / 6k rather than 0 / 1,873 / 3,746. */
function niceScale(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 4, step: 1 };
  const rough = max / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? 10 * mag;
  return { top: step * Math.ceil(max / step), step };
}

/**
 * Single-series column chart in plain SVG: thin saffron columns with a rounded cap, a hairline
 * grid, thinned axis labels, a hover tooltip per column and a hidden table for screen readers.
 */
export function TrendChart({ points, granularity, format, axis, label, height = 248 }: TrendChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = Math.max(0, ...points.map((p) => p.value));
  const { top, step } = useMemo(() => niceScale(max), [max]);
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const n = Math.max(1, points.length);
  const band = plotW / n;
  const barW = Math.max(3, Math.min(24, band * 0.62));
  const y = (v: number) => PAD.top + plotH - (Math.max(0, v) / top) * plotH;
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 58))));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const empty = max === 0;
  const h = hover !== null ? points[hover] : null;

  return (
    <figure ref={ref} className="relative" aria-label={label}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true" className="block select-none" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" strokeWidth={1} />
            <text x={PAD.left - 10} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[11px] tabular-nums">
              {axis(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = PAD.left + band * i + band / 2;
          const top = y(p.value);
          const hgt = PAD.top + plotH - top;
          const r = Math.min(4, barW / 2, hgt);
          const x0 = cx - barW / 2;
          const base = PAD.top + plotH;
          const d =
            hgt <= 0
              ? ''
              : `M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${base} Z`;
          return (
            <g key={p.key}>
              {d && <path d={d} fill="rgb(var(--accent))" opacity={hover === null || hover === i ? 1 : 0.38} style={{ transition: 'opacity 150ms ease' }} />}
              {i % every === 0 && (
                <text x={cx} y={height - 10} textAnchor="middle" className="fill-ink-3 text-[11px]">
                  {bucketLabel(p.key, granularity)}
                </text>
              )}
              <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} />
            </g>
          );
        })}
        {hover !== null && h && (
          <line
            x1={PAD.left + band * hover + band / 2}
            x2={PAD.left + band * hover + band / 2}
            y1={PAD.top}
            y2={PAD.top + plotH}
            stroke="rgb(var(--line-strong))"
            strokeWidth={1}
            pointerEvents="none"
          />
        )}
      </svg>

      {h && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 min-w-[132px] -translate-x-1/2 rounded-[12px] bg-ink px-3 py-2 text-surface shadow-float"
          style={{
            left: Math.min(width - 72, Math.max(72, PAD.left + band * hover + band / 2)),
            top: Math.max(0, y(h.value) - 62),
          }}
        >
          <p className="text-xs text-surface/70">{bucketTitle(h.key, granularity)}</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums">{format(h.value)}</p>
        </div>
      )}

      {empty && (
        <p className="pointer-events-none absolute inset-x-0 text-center text-sm text-ink-3" style={{ top: PAD.top + plotH / 2 - 10 }}>
          Nothing in this period yet
        </p>
      )}

      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <th scope="row">{bucketTitle(p.key, granularity)}</th>
              <td>{format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
