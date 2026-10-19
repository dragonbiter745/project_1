import { IndianRupee } from 'lucide-react';
import { formatPaise } from '@foodcourt/shared';
import { SHOP_BY_ID } from '../../data/shops';
import { spotlight, useScrollProgress } from '../../lib/hooks';
import { RevealWords } from './ScrollFx';

const TICKETS = [
  { token: 'DC-042', shop: 'dosa-corner', items: ['1 × Masala Dosa', '1 × Filter Coffee'] },
  { token: 'WM-019', shop: 'wok-momos', items: ['1 × Chicken Momos'] },
  { token: 'JS-063', shop: 'juice-shakes', items: ['2 × Mango Shake'] },
];

function priceOf(shopId: string, lines: string[]) {
  const menu = SHOP_BY_ID[shopId]!.menu;
  return lines.reduce((n, l) => {
    const [qty, name] = l.split(' × ');
    return n + (menu.find((m) => m.name === name)?.pricePaise ?? 0) * Number(qty);
  }, 0);
}

export function Split() {
  const ref = useScrollProgress<HTMLElement>('pin');
  const total = TICKETS.reduce((n, t) => n + priceOf(t.shop, t.items), 0);
  return (
    <section ref={ref} aria-label="One payment, split per kitchen" className="relative bg-bg" style={{ height: '200vh', ['--k' as string]: 'clamp(0, calc(var(--p) * 1.7 - 0.15), 1)' }}>
      <div className="sticky top-0 flex h-[100dvh] items-center overflow-hidden">
        <div className="pointer-events-none absolute right-[-10%] top-[10%] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgb(255_214_186/0.7),transparent_65%)]" />
        <div className="relative mx-auto w-full max-w-[1240px] px-5 pt-14 md:px-10">
          <div className="grid gap-4 md:grid-cols-[1.15fr_1fr] md:items-end">
            <RevealWords text="One payment in. A clean ticket for every kitchen out." accent={['ticket']} className="text-[34px] font-semibold leading-[1.04] tracking-[-0.03em] text-ink md:text-6xl" />
            <p className="max-w-[44ch] text-base leading-relaxed text-ink-2 md:text-lg">
              The court takes a single UPI payment and splits it to the paisa. Each shop sees only its own ticket, its own items and its own takings.
            </p>
          </div>

          <div className="mt-8 grid items-center gap-4 md:mt-12 lg:grid-cols-[320px_1fr] lg:gap-10">
            <div className="glass-strong spot relative z-10 rounded-[28px] p-5 md:p-6" onPointerMove={spotlight}>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink-3">
                <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-accent-ink text-white">
                  <IndianRupee className="h-4 w-4" />
                </span>
                One UPI payment · T07
              </p>
              <p className="mt-3 text-4xl font-semibold tabular-nums tracking-tight text-ink md:text-5xl">{formatPaise(total)}</p>
              <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface-2">
                {TICKETS.map((t) => (
                  <span
                    key={t.token}
                    className="h-full origin-left rounded-full"
                    style={{ width: `${(priceOf(t.shop, t.items) / total) * 100}%`, background: SHOP_BY_ID[t.shop]!.color, transform: 'scaleX(var(--k))' }}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-3">Scroll to split it across three kitchens</p>
            </div>

            <ul className="grid grid-cols-3 gap-2.5 md:gap-4">
              {TICKETS.map((t, i) => {
                const shop = SHOP_BY_ID[t.shop]!;
                return (
                  <li
                    key={t.token}
                    className="rounded-[20px] bg-white p-3.5 shadow-card ring-1 ring-inset ring-line/60 md:rounded-[24px] md:p-5"
                    style={{
                      opacity: 'calc(0.15 + var(--k) * 0.85)',
                      transform: `translate(calc((1 - var(--k)) * ${-120 - i * 110}px), calc((1 - var(--k)) * ${40 - i * 30}px)) rotate(calc((1 - var(--k)) * ${-12 + i * 9}deg)) scale(calc(0.75 + var(--k) * 0.25))`,
                    }}
                  >
                    <span className="block h-1.5 w-10 rounded-full" style={{ background: shop.color }} />
                    <p className="mt-3 truncate text-[11px] font-semibold text-ink-3 md:text-xs">{shop.name}</p>
                    <p className="mt-1 font-mono text-lg font-semibold tracking-tight text-ink md:text-3xl">{t.token}</p>
                    <ul className="mt-2 hidden space-y-1 text-sm text-ink-2 md:block">
                      {t.items.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                    <p className="mt-3 border-t border-line/70 pt-2 text-sm font-semibold tabular-nums text-ink">{formatPaise(priceOf(t.shop, t.items))}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
