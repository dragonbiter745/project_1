import { ArrowRight, IndianRupee } from 'lucide-react';
import { formatPaise } from '@foodcourt/shared';
import { SHOP_BY_ID } from '../../data/shops';
import { spotlight, useReveal } from '../../lib/hooks';

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
  const ref = useReveal<HTMLDivElement>();
  const total = TICKETS.reduce((n, t) => n + priceOf(t.shop, t.items), 0);
  return (
    <section className="relative overflow-hidden bg-bg py-24 md:py-32">
      <div ref={ref} className="mx-auto max-w-[1240px] px-5 md:px-10">
        <div className="reveal grid gap-6 md:grid-cols-[1.1fr_1fr] md:items-end">
          <h2 className="text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-ink md:text-6xl [text-wrap:balance]">One payment in. A clean ticket for every kitchen out.</h2>
          <p className="max-w-[46ch] text-lg leading-relaxed text-ink-2">
            The court takes a single UPI payment and splits it to the paisa. Each shop sees only its own ticket, its own items and its own takings.
          </p>
        </div>

        <div className="mt-14 grid items-center gap-6 lg:grid-cols-[320px_auto_1fr]">
          <div className="reveal glass spot lift rounded-[28px] p-6" style={{ ['--i' as string]: 1 }} onPointerMove={spotlight}>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink-3">
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-accent-ink text-white">
                <IndianRupee className="h-4 w-4" />
              </span>
              One UPI payment
            </p>
            <p className="mt-4 text-5xl font-semibold tabular-nums tracking-tight text-ink">{formatPaise(total)}</p>
            <p className="mt-2 text-sm text-ink-3">Table T07 · 3 shops · paid 12:48 pm</p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="flex h-full">
                {TICKETS.map((t) => (
                  <span key={t.token} style={{ width: `${(priceOf(t.shop, t.items) / total) * 100}%`, background: SHOP_BY_ID[t.shop]!.color }} />
                ))}
              </div>
            </div>
          </div>

          <div className="reveal hidden justify-center lg:flex" style={{ ['--i' as string]: 2 }}>
            <ArrowRight className="h-8 w-8 text-accent" strokeWidth={1.75} />
          </div>

          <ul className="grid gap-4 sm:grid-cols-3">
            {TICKETS.map((t, i) => {
              const shop = SHOP_BY_ID[t.shop]!;
              const rgb = shop.color.match(/\w\w/g)!.map((h) => parseInt(h, 16)).join(' ');
              return (
                <li
                  key={t.token}
                  className="reveal glass spot lift rounded-[24px] p-5"
                  style={{ ['--i' as string]: i + 3, ['--spot' as string]: rgb }}
                  onPointerMove={spotlight}
                >
                  <p className="flex items-center gap-2 text-xs font-semibold text-ink-3">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: shop.color }} />
                    {shop.name}
                  </p>
                  <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-ink">{t.token}</p>
                  <ul className="mt-3 space-y-1 text-sm text-ink-2">
                    {t.items.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                  <p className="mt-4 border-t border-line/70 pt-3 text-sm font-semibold tabular-nums text-ink">{formatPaise(priceOf(t.shop, t.items))}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
