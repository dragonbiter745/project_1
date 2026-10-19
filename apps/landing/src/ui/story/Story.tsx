import { useState } from 'react';
import { BellRing, LayoutGrid, QrCode, ReceiptText, ShoppingBag } from 'lucide-react';
import { cx } from '@foodcourt/ui';
import { useScrollProgress } from '../../lib/hooks';
import { Phone } from './Phone';

const STEPS = [
  {
    icon: QrCode,
    kicker: 'Scan',
    title: 'Sit anywhere, scan the table.',
    body: 'Every table carries its own QR. Your table number rides along with the order, so nobody shouts names across the hall.',
    tint: 'rgb(255 228 210)',
    chips: ['Table T07', 'No app to install', 'Opens in 1 second'],
  },
  {
    icon: LayoutGrid,
    kicker: 'Browse',
    title: 'All eight kitchens in one menu.',
    body: 'Dosa, biryani, momos and a mango shake side by side, with live prices, prep times and what just sold out.',
    tint: 'rgb(254 240 199)',
    chips: ['8 kitchens', '56 dishes', 'Live sold-out'],
  },
  {
    icon: ShoppingBag,
    kicker: 'Pay once',
    title: 'One cart. One UPI payment.',
    body: 'Mix dishes from as many shops as you like. You pay once, and each kitchen gets exactly its own share.',
    tint: 'rgb(253 226 228)',
    chips: ['3 shops', '1 payment', 'GST included'],
  },
  {
    icon: ReceiptText,
    kicker: 'Track',
    title: 'A token for every shop, live.',
    body: 'Each kitchen gets its ticket the same second. Watch every token move from accepted to cooking to ready.',
    tint: 'rgb(237 233 254)',
    chips: ['DC-042 cooking', 'WM-019 accepted', 'CC-107 ready'],
  },
  {
    icon: BellRing,
    kicker: 'Eat',
    title: 'Collect it, or have it brought over.',
    body: 'Your phone pings the moment a tray is ready. Grab it at the counter, or a runner carries it to your table.',
    tint: 'rgb(209 250 229)',
    chips: ['Ping on ready', 'Runner to T07', 'Zero queueing'],
  },
];

export function Story() {
  const [active, setActive] = useState(0);
  const ref = useScrollProgress<HTMLElement>('pin', (p) => {
    const i = Math.min(STEPS.length - 1, Math.floor(p * STEPS.length * 0.999));
    setActive((cur) => (cur === i ? cur : i));
  });
  const step = STEPS[active]!;

  return (
    <section ref={ref} id="story" aria-label="How it works" className="relative scroll-mt-0" style={{ height: `${STEPS.length * 80 + 40}vh` }}>
      <div className="sticky top-0 flex h-[100dvh] items-center overflow-hidden transition-[background-color] duration-700" style={{ backgroundColor: step.tint }}>
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-50" />
        <div className="pointer-events-none absolute -left-40 top-1/4 h-[520px] w-[520px] rounded-full bg-white/50 blur-3xl" />

        <div className="relative mx-auto grid w-full max-w-[1240px] items-center gap-6 px-5 pt-16 md:px-10 lg:grid-cols-[1fr_auto] lg:gap-16">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-accent-ink">How it works</p>
            <div key={active} className="enter-up">
              <p className="mt-5 font-mono text-sm font-semibold text-ink-3">
                0{active + 1} / 0{STEPS.length} · {step.kicker}
              </p>
              <h2 className="mt-2 max-w-[14ch] text-[40px] font-semibold leading-[1.02] tracking-[-0.035em] text-ink md:text-[68px]">{step.title}</h2>
              <p className="mt-4 max-w-[44ch] text-base leading-relaxed text-ink-2 md:text-lg">{step.body}</p>
            </div>

            <ol className="mt-8 hidden gap-2 sm:flex">
              {STEPS.map((s, i) => (
                <li key={s.kicker} className="flex-1">
                  <span className={cx('flex items-center gap-2 text-xs font-semibold transition-colors', i <= active ? 'text-ink' : 'text-ink-3')}>
                    <s.icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                    {s.kicker}
                  </span>
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-ink/10">
                    <span
                      className="block h-full origin-left rounded-full bg-accent-ink"
                      style={{ transform: `scaleX(clamp(0, calc(var(--p) * ${STEPS.length} - ${i}), 1))` }}
                    />
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* The box reserves the scaled phone's real footprint; transforms alone don't shrink layout. */}
          <div className="relative mx-auto h-[322px] w-[166px] sm:h-[484px] sm:w-[250px] lg:h-[622px] lg:w-[322px]">
          <div className="absolute left-1/2 top-0 w-[322px] origin-top -translate-x-1/2 scale-[0.52] sm:scale-[0.78] lg:scale-100">
            <div style={{ transform: 'perspective(1600px) rotateY(calc((0.5 - var(--p)) * 18deg)) rotateX(calc((var(--p) - 0.5) * 6deg))' }}>
              <Phone step={active} />
            </div>
            {step.chips.map((c, i) => (
              <span
                key={`${active}-${c}`}
                className="glass-strong enter-up absolute hidden whitespace-nowrap sm:block rounded-full px-4 py-2 text-sm font-semibold text-ink"
                style={{
                  ['--i' as string]: i,
                  left: i === 1 ? 'auto' : '-34%',
                  right: i === 1 ? '-30%' : 'auto',
                  top: `${18 + i * 26}%`,
                  translate: `0 calc((var(--p) - 0.5) * ${(i + 1) * -60}px)`,
                }}
              >
                {c}
              </span>
            ))}
          </div>
          </div>
        </div>
      </div>
    </section>
  );
}
