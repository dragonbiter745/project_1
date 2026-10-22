import { useRef } from 'react';
import { BellRing, Clock3, PackageX, PauseCircle, Smartphone, Undo2 } from 'lucide-react';
import { spotlight, useScrollProgress } from '../../lib/hooks';
import { RevealWords } from './ScrollFx';

const FEATURES = [
  { icon: BellRing, title: 'Rings until accepted', body: 'A new ticket chimes every few seconds until someone taps Accept. No order sits unseen.', tone: '#3A0F34' },
  { icon: Clock3, title: 'Colour that escalates', body: 'Tickets warm up at 2, 5 and 10 minutes, so the oldest order is always the loudest.', tone: '#5C1F54' },
  { icon: PackageX, title: 'Sold out in one tap', body: 'Out of mutton? Toggle it and every diner’s menu updates before the next order.', tone: '#3A0F34' },
  { icon: PauseCircle, title: 'Pause when slammed', body: 'Stop new orders for a while; diners can still browse, and orders resume on their own.', tone: '#5C1F54' },
  { icon: Undo2, title: 'Mistakes undo', body: 'Marked ready by accident? There is a 30 second undo, and collection waits 10 seconds.', tone: '#3A0F34' },
  { icon: Smartphone, title: 'Any tablet, any phone', body: 'A three-column board on the counter tablet, a one-handed swipe board on a cook’s phone.', tone: '#5C1F54' },
];

const TICKETS = [
  { token: 'DC-042', line: 'T07 · 1 × Masala Dosa', age: '1m', col: 0, tone: 'bg-surface-2 text-ink-2' },
  { token: 'BH-118', line: 'T15 · 2 × Chicken Biryani', age: '6m', col: 1, tone: 'bg-prep text-white' },
  { token: 'WM-021', line: 'Pickup · 1 × Veg Momos', age: '3m', col: 1, tone: 'bg-prep-tint text-prep' },
  { token: 'PS-027', line: 'T22 · 3 × Margherita', age: '9m', col: 2, tone: 'bg-ready-tint text-ready' },
];

export function Kitchens() {
  const track = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const ref = useScrollProgress<HTMLElement>('pin', (p) => {
    const t = track.current;
    const v = viewport.current;
    if (!t || !v) return;
    const travel = Math.max(0, t.scrollWidth - v.clientWidth);
    t.style.transform = `translate3d(${-p * travel}px, 0, 0)`;
  });

  return (
    <section ref={ref} id="kitchens" aria-label="For kitchens" className="field-mint relative" style={{ height: '280vh' }}>
      <div className="sticky top-0 flex h-[100dvh] flex-col justify-center overflow-hidden">
        <div className="mx-auto w-full max-w-[1240px] px-5 pt-14 md:px-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-accent-ink">For kitchens</p>
              <RevealWords text="A display cooks can read from across the line." accent={['across']} className="mt-2 max-w-[18ch] text-[34px] font-semibold leading-[1.04] tracking-[-0.03em] text-ink md:text-6xl" />
            </div>
            <p className="hidden font-mono text-sm font-semibold text-ink-3 md:block">Keep scrolling →</p>
          </div>
        </div>

        <div ref={viewport} className="mt-8 w-full md:mt-12">
          <div ref={track} className="flex w-max gap-4 px-5 will-change-transform md:gap-5 md:px-[max(2.5rem,calc((100vw_-_1240px)/2_+_2.5rem))]">
            {/* Live board mock */}
            <article className="w-[min(86vw,640px)] shrink-0 rounded-[30px] bg-white/80 p-4 shadow-card ring-1 ring-inset ring-white md:p-5">
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  ['New', 'bg-accent-tint text-accent-ink'],
                  ['Cooking', 'bg-prep-tint text-prep'],
                  ['Ready', 'bg-ready-tint text-ready'],
                ].map(([t, tone]) => (
                  <p key={t} className={`rounded-[12px] px-3 py-2 text-xs font-semibold md:text-sm ${tone}`}>
                    {t}
                  </p>
                ))}
              </div>
              <div className="mt-2.5 grid min-h-[220px] grid-cols-3 gap-2.5">
                {[0, 1, 2].map((col) => (
                  <div key={col} className="space-y-2 rounded-[14px] bg-surface-2/60 p-1.5">
                    {TICKETS.filter((t) => t.col === col).map((t, i) => (
                      <div key={t.token} className="ticket-in rounded-[12px] bg-white p-2.5 shadow-card ring-1 ring-inset ring-line/70" style={{ animationDelay: `${i * 120}ms` }}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-sm font-semibold text-ink md:text-base">{t.token}</span>
                          <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold ${t.tone}`}>{t.age}</span>
                        </div>
                        <p className="mt-1 truncate text-[10px] text-ink-3 md:text-xs">{t.line}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </article>

            {FEATURES.map((f) => {
              const rgb = f.tone.match(/\w\w/g)!.map((h) => parseInt(h, 16)).join(' ');
              return (
                <article
                  key={f.title}
                  className="glass spot lift flex w-[min(74vw,320px)] shrink-0 flex-col rounded-[28px] p-6"
                  style={{ ['--spot' as string]: rgb }}
                  onPointerMove={spotlight}
                >
                  <span className="grid h-12 w-12 place-items-center rounded-[15px] text-white shadow-card" style={{ background: f.tone }}>
                    <f.icon className="h-6 w-6" strokeWidth={2} />
                  </span>
                  <h3 className="mt-auto pt-16 text-2xl font-semibold leading-tight tracking-tight text-ink">{f.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{f.body}</p>
                </article>
              );
            })}
          </div>
        </div>

        <div className="mx-auto mt-8 w-full max-w-[1240px] px-5 md:px-10">
          <div className="h-1 overflow-hidden rounded-full bg-ink/10">
            <div className="h-full origin-left rounded-full bg-accent" style={{ transform: 'scaleX(var(--p))' }} />
          </div>
        </div>
      </div>
    </section>
  );
}
