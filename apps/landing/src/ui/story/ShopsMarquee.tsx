import { formatPaise } from '@foodcourt/shared';
import { SHOPS } from '../../data/shops';
import { spotlight } from '../../lib/hooks';

export function ShopsMarquee() {
  const cards = [...SHOPS, ...SHOPS];
  return (
    <section aria-label="The kitchens" className="relative overflow-hidden bg-bg pb-24 md:pb-32">
      <div className="mx-auto max-w-[1240px] px-5 md:px-10">
        <p className="text-sm font-semibold text-accent-ink">Eight kitchens, one hall</p>
      </div>
      <div className="mt-6 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <ul className="marquee gap-4 py-4">
          {cards.map((s, i) => {
            const rgb = s.color.match(/\w\w/g)!.map((h) => parseInt(h, 16)).join(' ');
            const hero = s.menu[0]!;
            return (
              <li
                key={`${s.id}-${i}`}
                aria-hidden={i >= SHOPS.length}
                className="spot lift w-[280px] shrink-0 overflow-hidden rounded-[26px] bg-white p-5 shadow-card ring-1 ring-inset ring-line/60"
                style={{ ['--spot' as string]: rgb }}
                onPointerMove={spotlight}
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-[15px] font-mono text-sm font-bold text-white" style={{ background: s.color }}>
                    {s.code}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold tracking-tight text-ink">{s.name}</p>
                    <p className="truncate text-xs text-ink-3">{s.tagline}</p>
                  </div>
                </div>
                <div className="mt-5 flex items-end justify-between rounded-[18px] p-3.5" style={{ background: `rgb(${rgb} / 0.09)` }}>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: s.color }}>
                      Most ordered
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink">{hero.name}</p>
                  </div>
                  <p className="font-mono text-sm font-semibold text-ink">{formatPaise(hero.pricePaise)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
