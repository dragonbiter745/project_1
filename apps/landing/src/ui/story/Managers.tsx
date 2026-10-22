import { AlertTriangle, LayoutGrid, PauseCircle, QrCode, Radio } from 'lucide-react';
import { cx } from '@foodcourt/ui';
import { spotlight, useScrollProgress } from '../../lib/hooks';
import { RevealWords } from './ScrollFx';

const FEATURES = [
  { icon: Radio, title: 'Every order, as it happens', body: 'One live list across all shops, filterable by kitchen and status, with a cancel when something goes wrong.' },
  { icon: LayoutGrid, title: 'Tables at a glance', body: 'See which tables are taken, waiting to be cleaned or free, and send housekeeping where they are needed.' },
  { icon: AlertTriangle, title: 'Alerts before complaints', body: 'A long line at one counter, an order nobody accepted, a dish that ran out: it surfaces before diners notice.' },
  { icon: PauseCircle, title: 'Pause a shop, or the court', body: 'Take one kitchen offline for a while, or switch the whole court to maintenance with a single toggle.' },
  { icon: QrCode, title: 'Print table QR codes', body: 'Generate and reprint the code for any table; each one carries its table number into every order.' },
];

const ROWS = ['bg-accent', 'bg-ink', 'bg-accent/70', 'bg-ink/70', 'bg-accent/45', 'bg-ink/45'];
const TABLE_TONES = ['bg-surface-2', 'bg-accent/60', 'bg-accent/60', 'bg-surface-2', 'bg-accent-tint', 'bg-accent/60', 'bg-ink/40', 'bg-surface-2', 'bg-accent/60', 'bg-surface-2', 'bg-accent/60', 'bg-surface-2'];

/** The operations console, shown as a wireframe illustration: no figures until real ones exist. */
function ConsoleSketch() {
  return (
    <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
      <div className="rounded-[20px] bg-white p-4 ring-1 ring-inset ring-line/60">
        <div className="flex items-center justify-between">
          <span className="h-3 w-28 rounded-full bg-ink/80" />
          <span className="flex gap-1.5">
            {['bg-accent-tint', 'bg-surface-2', 'bg-surface-2'].map((c, i) => (
              <span key={i} className={cx('h-6 w-14 rounded-full', c)} />
            ))}
          </span>
        </div>
        <ul className="mt-4 space-y-2">
          {ROWS.map((tone, i) => (
            <li key={i} className="flex items-center gap-3 rounded-[12px] bg-bg px-3 py-2.5">
              <span className={cx('h-7 w-7 shrink-0 rounded-[9px]', tone)} />
              <span className="h-2.5 rounded-full bg-ink/15" style={{ width: `${30 + ((i * 37) % 35)}%` }} />
              <span className={cx('ml-auto h-5 w-16 rounded-full', i % 3 === 0 ? 'bg-ready-tint' : i % 3 === 1 ? 'bg-prep-tint' : 'bg-accent-tint')} />
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-3">
        <div className="rounded-[20px] bg-white p-4 ring-1 ring-inset ring-line/60">
          <span className="block h-3 w-20 rounded-full bg-ink/70" />
          <ul className="mt-3 grid grid-cols-6 gap-1.5">
            {TABLE_TONES.map((t, i) => (
              <li key={i} className={cx('h-8 rounded-[8px]', t)} />
            ))}
          </ul>
        </div>
        <div className="rounded-[20px] bg-white p-4 ring-1 ring-inset ring-line/60">
          <span className="block h-3 w-24 rounded-full bg-ink/70" />
          <div className="mt-4 flex h-20 items-end gap-1.5">
            {[30, 45, 70, 95, 80, 55, 40, 60, 85, 50].map((h, i) => (
              <span key={i} className="flex-1 rounded-t-[4px] bg-accent" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Managers() {
  const ref = useScrollProgress<HTMLElement>('through');
  return (
    <section ref={ref} id="managers" className="field-violet relative scroll-mt-20 overflow-hidden py-16 md:py-24">
      <div className="mx-auto max-w-[1240px] px-5 md:px-10">
        <div className="grid gap-4 md:grid-cols-[1.1fr_1fr] md:items-end">
          <div>
            <p className="text-sm font-semibold text-accent-ink">For the court</p>
            <RevealWords text="Every shop, every table, one screen." accent={['one']} className="mt-2 text-[34px] font-semibold leading-[1.04] tracking-[-0.03em] text-ink md:text-6xl" />
          </div>
          <p className="max-w-[46ch] text-base leading-relaxed text-ink-2 md:text-lg">
            The operations console gives the court manager the whole hall in one place: orders, tables, kitchens and the switches that affect them all.
          </p>
        </div>

        {/* Lands flat as it scrolls into view. */}
        <div
          className="mt-10 origin-top rounded-[32px] bg-white/75 p-4 shadow-[0_40px_80px_-40px_rgba(58,15,52,0.4)] ring-1 ring-inset ring-white md:p-6"
          style={{ transform: 'perspective(1600px) rotateX(calc((1 - min(1, var(--p) * 2.6)) * 24deg)) scale(calc(0.9 + min(1, var(--p) * 2.6) * 0.1))' }}
        >
          <ConsoleSketch />
        </div>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map((f) => (
            <li key={f.title} className="glass spot lift rounded-[22px] p-5" style={{ ['--spot' as string]: '124 58 237' }} onPointerMove={spotlight}>
              <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-accent-tint text-accent-ink">
                <f.icon className="h-5 w-5" strokeWidth={2} />
              </span>
              <h3 className="mt-4 text-base font-semibold leading-snug tracking-tight text-ink">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
