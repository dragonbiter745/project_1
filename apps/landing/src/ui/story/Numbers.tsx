import { useCountUp, useReveal, useScrollProgress } from '../../lib/hooks';

function Stat({ value, suffix, label, i }: { value: number; suffix?: string; label: string; i: number }) {
  const [ref, n] = useCountUp(value);
  return (
    <div className="reveal" style={{ ['--i' as string]: i }}>
      <p className="glass inline-block rounded-[22px] px-4 py-2 text-5xl font-semibold tabular-nums tracking-[-0.04em] text-ink md:text-7xl">
        <span ref={ref}>{Math.round(n).toLocaleString('en-IN')}</span>
        {suffix && <span className="text-gradient">{suffix}</span>}
      </p>
      <p className="mt-2 max-w-[22ch] text-[15px] text-ink-2">{label}</p>
    </div>
  );
}

export function Numbers() {
  const ref = useReveal<HTMLDivElement>();
  const band = useScrollProgress<HTMLElement>('through');
  return (
    <section ref={band} className="relative overflow-hidden bg-bg py-16 md:py-24">
      {/* Oversized words drifting sideways with the scroll. */}
      <p aria-hidden className="text-outline pointer-events-none absolute left-0 top-6 whitespace-nowrap text-[18vw] font-bold leading-none tracking-[-0.04em]" style={{ transform: 'translateX(calc(var(--p) * -45%))' }}>
        Scan · Order · Pay once · Eat · Scan · Order
      </p>
      <div ref={ref} className="relative mx-auto max-w-[1240px] px-5 md:px-10">
        <h2 className="reveal max-w-[760px] text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-ink md:text-6xl [text-wrap:balance]">Built for the 1 pm rush, not the quiet 4 pm.</h2>
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <Stat value={3000} suffix="+" label="Diners at peak the platform is built to serve without slowing down" i={1} />
          <Stat value={8} label="Kitchens in one cart, one checkout, one UPI payment" i={2} />
          <Stat value={24} label="Tables, each with its own QR that knows where to deliver" i={3} />
          <Stat value={0} label="Apps to download. It opens in the phone's browser" i={4} />
        </div>
      </div>
    </section>
  );
}
