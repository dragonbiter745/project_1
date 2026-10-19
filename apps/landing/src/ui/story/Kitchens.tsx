import { BellRing, Clock3, PackageX, PauseCircle, Smartphone, Undo2 } from 'lucide-react';
import { spotlight, useReveal } from '../../lib/hooks';

const FEATURES = [
  { icon: BellRing, title: 'Rings until accepted', body: 'A new ticket chimes every few seconds until someone taps Accept. No order sits unseen.' },
  { icon: Clock3, title: 'Colour that escalates', body: 'Tickets warm up at 2, 5 and 10 minutes, so the oldest order is always the loudest.' },
  { icon: PackageX, title: 'Sold out in one tap', body: 'Out of mutton? Toggle it and every diner’s menu updates before the next order.' },
  { icon: PauseCircle, title: 'Pause when slammed', body: 'Stop new orders for a while; diners can still browse, and orders resume on their own.' },
  { icon: Undo2, title: 'Mistakes undo', body: 'Marked ready by accident? There is a 30 second undo, and collection waits 10 seconds.' },
  { icon: Smartphone, title: 'Any tablet, any phone', body: 'A three-column board on the counter tablet, a one-handed swipe board on a cook’s phone.' },
];

export function Kitchens() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="kitchens" className="field-mint relative scroll-mt-20 overflow-hidden py-24 md:py-32">
      <div ref={ref} className="mx-auto max-w-[1240px] px-5 md:px-10">
        <div className="reveal max-w-[760px]">
          <p className="text-sm font-semibold text-[#0f766e]">For kitchens</p>
          <h2 className="mt-3 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-ink md:text-6xl [text-wrap:balance]">A kitchen display cooks can read from across the line.</h2>
        </div>

        <div className="reveal mt-12 overflow-hidden rounded-[32px] bg-white/70 p-4 shadow-card ring-1 ring-inset ring-white md:p-6" style={{ ['--i' as string]: 1 }}>
          <div className="grid grid-cols-3 gap-3">
            {[
              ['New', 'bg-accent-tint text-accent-ink'],
              ['Cooking', 'bg-prep-tint text-prep'],
              ['Ready', 'bg-ready-tint text-ready'],
            ].map(([title, tone]) => (
              <p key={title} className={`rounded-[14px] px-4 py-2.5 text-sm font-semibold ${tone}`}>
                {title}
              </p>
            ))}
          </div>
          <div className="relative mt-3 h-[210px] overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="ticket-move absolute left-0 w-[calc((100%-24px)/3)]" style={{ top: i * 70, animationDelay: `${i * -3}s` }}>
                <div className="flex items-center justify-between rounded-[18px] bg-white px-4 py-3 shadow-card ring-1 ring-inset ring-line/70">
                  <div>
                    <p className="font-mono text-lg font-semibold text-ink">{['DC-042', 'BH-118', 'PS-027'][i]}</p>
                    <p className="text-xs text-ink-3">{['T07 · 1 × Masala Dosa', 'T15 · 2 × Chicken Biryani', 'Pickup · 3 × Margherita'][i]}</p>
                  </div>
                  <span className="rounded-full bg-prep-tint px-2.5 py-1 font-mono text-xs font-semibold text-prep">{[2, 6, 1][i]}m</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <li key={f.title} className="reveal glass spot lift rounded-[24px] p-6" style={{ ['--i' as string]: i + 2, ['--spot' as string]: '15 118 110' }} onPointerMove={spotlight}>
              <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#ccfbf1] text-[#0f766e]">
                <f.icon className="h-5 w-5" strokeWidth={2} />
              </span>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-ink">{f.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
