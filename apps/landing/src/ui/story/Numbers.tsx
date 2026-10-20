import { Smartphone, Wallet, Zap, ShieldCheck } from 'lucide-react';
import { spotlight, useReveal, useScrollProgress } from '../../lib/hooks';
import { RevealWords } from './ScrollFx';

const POINTS = [
  { icon: Smartphone, title: 'Nothing to install', body: 'It opens in the phone’s browser from the table QR. Any phone, any network.' },
  { icon: Wallet, title: 'One payment for everything', body: 'Diners pay once by UPI; every kitchen receives exactly its own share.' },
  { icon: Zap, title: 'Made for the rush hour', body: 'Light pages, instant tickets and kitchens that never miss an order when the hall fills up.' },
  { icon: ShieldCheck, title: 'Prices checked on the server', body: 'Menus, availability and totals are recalculated server-side, never trusted from the phone.' },
];

export function Numbers() {
  const ref = useReveal<HTMLUListElement>();
  const band = useScrollProgress<HTMLElement>('through');
  return (
    <section ref={band} aria-label="Why it works" className="relative overflow-hidden bg-bg py-16 md:py-24">
      {/* Oversized words drifting sideways with the scroll. */}
      <p aria-hidden className="text-outline pointer-events-none absolute left-0 top-6 whitespace-nowrap text-[18vw] font-bold leading-none tracking-[-0.04em]" style={{ transform: 'translateX(calc(var(--p) * -45%))' }}>
        Scan · Order · Pay once · Eat · Scan · Order
      </p>
      <div className="relative mx-auto max-w-[1240px] px-5 md:px-10">
        <RevealWords text="Built for the lunch rush, not the quiet afternoon." accent={['rush,']} className="max-w-[18ch] text-[34px] font-semibold leading-[1.04] tracking-[-0.03em] text-ink md:text-6xl" />
        <ul ref={ref} className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {POINTS.map((p, i) => (
            <li key={p.title} className="reveal glass spot lift rounded-[24px] p-6" style={{ ['--i' as string]: i }} onPointerMove={spotlight}>
              <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-accent-tint text-accent-ink">
                <p.icon className="h-5 w-5" strokeWidth={2} />
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink">{p.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{p.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
