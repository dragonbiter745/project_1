import { useEffect, useRef, useState } from 'react';
import { BellRing, LayoutGrid, QrCode, ReceiptText, ShoppingBag } from 'lucide-react';
import { cx } from '@foodcourt/ui';
import { useReveal } from '../../lib/hooks';
import { Phone } from './Phone';

const STEPS = [
  { icon: QrCode, kicker: '01 · Scan', title: 'Sit anywhere, scan the table', body: 'Every table carries its own QR. Your table number rides along with the order, so nobody has to shout a name across the hall.' },
  { icon: LayoutGrid, kicker: '02 · Browse', title: 'All eight kitchens in one menu', body: 'Dosa, biryani, momos and a mango shake, side by side, with live prices, prep times and what has sold out right now.' },
  { icon: ShoppingBag, kicker: '03 · Pay once', title: 'One cart, one UPI payment', body: 'Mix dishes from as many shops as you like. You pay once; each kitchen gets exactly its own share of the order.' },
  { icon: ReceiptText, kicker: '04 · Track', title: 'A token per shop, tracked live', body: 'Every kitchen gets its ticket instantly and you watch each one move: accepted, cooking, ready.' },
  { icon: BellRing, kicker: '05 · Eat', title: 'Collect, or have it brought over', body: 'Your phone pings the moment a tray is ready. Grab it from the counter, or a runner carries it to your table.' },
];

export function Story() {
  const [active, setActive] = useState(0);
  const items = useRef<Array<HTMLLIElement | null>>([]);
  const head = useReveal<HTMLDivElement>();

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
      },
      { rootMargin: '-45% 0px -45% 0px' }
    );
    items.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section id="story" className="field-saffron relative scroll-mt-20 overflow-hidden py-24 md:py-32">
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
      <div className="relative mx-auto max-w-[1240px] px-5 md:px-10">
        <div ref={head} className="reveal max-w-[720px]">
          <p className="text-sm font-semibold text-accent-ink">How it works</p>
          <h2 className="mt-3 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-ink md:text-6xl [text-wrap:balance]">From a QR on the table to food in front of you.</h2>
        </div>

        <div className="mt-16 grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-20">
          <ol className="space-y-[22vh] pb-[18vh] lg:pb-[30vh]">
            {STEPS.map((s, i) => (
              <li key={s.title} ref={(el) => void (items.current[i] = el)} data-step={i} className={cx('transition-opacity duration-500', active === i ? 'opacity-100' : 'lg:opacity-35')}>
                <span
                  className={cx(
                    'grid h-14 w-14 place-items-center rounded-[18px] transition-[background-color,color,transform] duration-500',
                    active === i ? 'scale-105 bg-accent-ink text-white shadow-float' : 'bg-white text-accent-ink shadow-card'
                  )}
                >
                  <s.icon className="h-6 w-6" strokeWidth={2} />
                </span>
                <p className="mt-5 font-mono text-sm font-semibold text-accent-ink">{s.kicker}</p>
                <h3 className="mt-1.5 text-3xl font-semibold tracking-tight text-ink md:text-4xl [text-wrap:balance]">{s.title}</h3>
                <p className="mt-3 max-w-[48ch] text-lg leading-relaxed text-ink-2">{s.body}</p>
                <div className="mt-8 lg:hidden">
                  <Phone step={i} />
                </div>
              </li>
            ))}
          </ol>
          <div className="hidden lg:block">
            <div className="sticky top-[calc(50vh-310px)]">
              <Phone step={active} />
              <div className="mt-6 flex justify-center gap-2">
                {STEPS.map((s, i) => (
                  <span key={s.title} className={cx('h-1.5 rounded-full transition-all duration-500', active === i ? 'w-8 bg-accent-ink' : 'w-1.5 bg-ink/20')} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
