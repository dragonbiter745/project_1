import { useState } from 'react';
import { Activity, Clock3, IndianRupee, Users } from 'lucide-react';
import { formatPaise } from '@foodcourt/shared';
import { cx } from '@foodcourt/ui';
import { TABLES } from '../../data/layout';
import { useScrollProgress } from '../../lib/hooks';
import { useUi } from '../../store/ui';
import { formatClock, waitLabel } from '../format';
import { RevealWords } from './ScrollFx';

const HEAT: Record<string, string> = { free: 'bg-[#dcfce7]', reserved: 'bg-[#fde68a]', occupied: 'bg-[#fdba74]', dirty: 'bg-[#fca5a5]', cleaning: 'bg-[#bae6fd]' };

export function Managers() {
  const ref = useScrollProgress<HTMLElement>('through');
  const snap = useUi((s) => s.snapshot);
  const [hover, setHover] = useState<number | null>(null);
  const hours = snap ? snap.hourly.slice(8, 24) : [];
  const max = Math.max(1, ...hours);
  const nowHour = snap ? Math.floor(snap.clockMinutes / 60) : 12;

  return (
    <section ref={ref} id="managers" className="field-violet relative scroll-mt-20 overflow-hidden py-16 md:py-24">
      <div className="mx-auto max-w-[1240px] px-5 md:px-10">
        <div className="grid gap-4 md:grid-cols-[1.1fr_1fr] md:items-end">
          <div>
            <p className="text-sm font-semibold text-[#7c3aed]">For the court</p>
            <RevealWords text="Every shop, every table, one live screen." accent={['live']} className="mt-2 text-[34px] font-semibold leading-[1.04] tracking-[-0.03em] text-ink md:text-6xl" />
          </div>
          <p className="max-w-[46ch] text-lg leading-relaxed text-ink-2">
            The numbers below are not a mock-up. They come from the court running in the 3D view above, updated four times a second.
          </p>
        </div>

        {/* Lands flat as it scrolls into view. */}
        <div
          className="mt-10 origin-top rounded-[32px] bg-white/75 p-4 shadow-[0_40px_80px_-40px_rgba(76,29,149,0.45)] ring-1 ring-inset ring-white md:p-6"
          style={{ transform: 'perspective(1600px) rotateX(calc((1 - min(1, var(--p) * 2.6)) * 24deg)) scale(calc(0.9 + min(1, var(--p) * 2.6) * 0.1))' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <span className="live-dot h-2 w-2 rounded-full bg-ready" />
              Operations console · {snap ? formatClock(snap.clockMinutes) : ''}
            </p>
            <p className="text-xs text-ink-3">{snap?.diners ?? 0} diners inside right now</p>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: IndianRupee, label: 'Sales today', value: snap ? formatPaise(snap.revenuePaise) : '–', tone: 'bg-accent-tint text-accent-ink' },
              { icon: Activity, label: 'Orders this hour', value: String(snap?.ordersThisHour ?? '–'), tone: 'bg-[#f3efff] text-[#7c3aed]' },
              { icon: Clock3, label: 'Average wait', value: waitLabel(snap?.avgWaitMin ?? null), tone: 'bg-prep-tint text-prep' },
              { icon: Users, label: 'Tables occupied', value: snap ? `${snap.tablesOccupied} of ${snap.tablesTotal}` : '–', tone: 'bg-ready-tint text-ready' },
            ].map((k) => (
              <div key={k.label} className="rounded-[20px] bg-white p-4 ring-1 ring-inset ring-line/60">
                <dt className="flex items-center gap-2 text-xs font-medium text-ink-3">
                  <span className={`grid h-7 w-7 place-items-center rounded-[9px] ${k.tone}`}>
                    <k.icon className="h-4 w-4" strokeWidth={2} />
                  </span>
                  {k.label}
                </dt>
                <dd className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-ink">{k.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <figure className="rounded-[20px] bg-white p-5 ring-1 ring-inset ring-line/60">
              <figcaption className="flex items-baseline justify-between text-sm font-semibold text-ink">
                Orders by hour
                <span className="text-xs font-medium text-ink-3">{hover === null ? 'Today' : `${hours[hover] ?? 0} orders at ${formatClock((hover + 8) * 60)}`}</span>
              </figcaption>
              <div className="mt-4 flex h-40 items-end gap-[3px]" onPointerLeave={() => setHover(null)}>
                {hours.map((v, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`${v} orders from ${formatClock((i + 8) * 60)}`}
                    onPointerEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    className="group flex h-full flex-1 items-end"
                  >
                    <span
                      className={cx('block w-full rounded-t-[4px] transition-[height,background-color] duration-700 ease-out', i + 8 === nowHour ? 'bg-accent' : hover === i ? 'bg-accent-ink' : 'bg-[#fdba74]')}
                      style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
                    />
                  </button>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-ink-3">
                <span>8 am</span>
                <span>1 pm</span>
                <span>6 pm</span>
                <span>11 pm</span>
              </div>
            </figure>
            <figure className="rounded-[20px] bg-white p-5 ring-1 ring-inset ring-line/60">
              <figcaption className="text-sm font-semibold text-ink">Tables right now</figcaption>
              <ul className="mt-4 grid grid-cols-6 gap-1.5">
                {TABLES.map((t) => {
                  const st = snap?.tableStatus[t.id] ?? 'free';
                  return (
                    <li key={t.id} title={`${t.label} · ${st}`} className={cx('grid h-10 place-items-center rounded-[10px] font-mono text-[11px] font-semibold text-ink/70 transition-colors duration-700', HEAT[st])}>
                      {t.label}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-3">
                {Object.entries({ Free: 'free', Occupied: 'occupied', Reserved: 'reserved', 'Needs cleaning': 'dirty' }).map(([l, k]) => (
                  <span key={k} className="inline-flex items-center gap-1">
                    <span className={cx('h-2.5 w-2.5 rounded-[3px]', HEAT[k])} />
                    {l}
                  </span>
                ))}
              </p>
            </figure>
          </div>

          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(snap?.shops ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-[16px] bg-white px-4 py-3 ring-1 ring-inset ring-line/60">
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="truncate">{s.name}</span>
                </span>
                <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', s.rush ? 'bg-danger-tint text-danger' : 'bg-surface-2 text-ink-2')}>
                  {s.queue} in line
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
