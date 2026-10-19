import { useCountUp, useReveal } from '../../lib/hooks';

function Stat({ value, suffix, label, i }: { value: number; suffix?: string; label: string; i: number }) {
  const [ref, n] = useCountUp(value);
  return (
    <div className="reveal" style={{ ['--i' as string]: i }}>
      <p className="text-5xl font-semibold tabular-nums tracking-[-0.04em] text-ink md:text-7xl">
        <span ref={ref}>{Math.round(n).toLocaleString('en-IN')}</span>
        {suffix && <span className="text-gradient">{suffix}</span>}
      </p>
      <p className="mt-2 max-w-[22ch] text-[15px] text-ink-2">{label}</p>
    </div>
  );
}

export function Numbers() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="relative bg-bg py-24 md:py-32">
      <div ref={ref} className="mx-auto max-w-[1240px] px-5 md:px-10">
        <h2 className="reveal max-w-[760px] text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-ink md:text-6xl [text-wrap:balance]">Built for the 1 pm rush, not the quiet 4 pm.</h2>
        <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <Stat value={3000} suffix="+" label="Diners at peak the platform is built to serve without slowing down" i={1} />
          <Stat value={8} label="Kitchens in one cart, one checkout, one UPI payment" i={2} />
          <Stat value={24} label="Tables, each with its own QR that knows where to deliver" i={3} />
          <Stat value={0} label="Apps to download. It opens in the phone's browser" i={4} />
        </div>
      </div>
    </section>
  );
}
