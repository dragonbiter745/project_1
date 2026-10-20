import { ArrowDown, ArrowRight, BellRing, Box, QrCode, Store, Wallet } from 'lucide-react';
import { orderAtTable } from '../../lib/links';
import { useUi } from '../../store/ui';

export function HeroOverlay() {
  const failed = useUi((s) => s.sceneFailed);
  const enter = (order = false) => useUi.setState({ explore: true, cameraMode: 'orbit', orderOpen: order });

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* Legibility wash on the text side only, so the court stays visible. */}
      <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-white/85 via-white/45 to-transparent md:w-[62%]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />

      <div className="relative mx-auto flex h-full max-w-[1320px] flex-col justify-center px-5 pb-28 pt-24 md:px-10">
        <div className="max-w-[640px]">
          <p className="enter-up glass pointer-events-auto inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium text-ink-2" style={{ ['--i' as string]: 0 }}>
            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
            {failed ? 'REVA Food Court' : 'Interactive 3D preview of the court'}
          </p>
          <h1 className="enter-up mt-6 text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] text-ink sm:text-6xl lg:text-[76px]" style={{ ['--i' as string]: 1 }}>
            Every kitchen.
            <br />
            One QR.
            <br />
            <span className="text-gradient">One payment.</span>
          </h1>
          <p className="enter-up mt-6 max-w-[52ch] text-lg leading-relaxed text-ink-2" style={{ ['--i' as string]: 2 }}>
            At REVA Food Court you order from every shop in a single cart, pay once by UPI and follow every token live from your table. No queue, nothing to install.
          </p>
          <div className="enter-up pointer-events-auto mt-8 flex flex-wrap gap-3" style={{ ['--i' as string]: 3 }}>
            {!failed && (
            <button
              type="button"
              onClick={() => enter(false)}
              className="pressable group inline-flex h-14 items-center gap-2.5 rounded-full bg-ink pl-6 pr-5 text-base font-semibold text-white shadow-float transition-[background-color,box-shadow] hover:bg-black"
            >
              <Box className="h-5 w-5" strokeWidth={2} />
              Explore the court in 3D
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2.25} />
            </button>
            )}
            <a
              href={orderAtTable()}
              className="pressable glass inline-flex h-14 items-center gap-2.5 rounded-full px-6 text-base font-semibold text-ink transition-colors hover:bg-white/90"
            >
              <QrCode className="h-5 w-5 text-accent-ink" strokeWidth={2} />
              Order from your table
            </a>
          </div>

          <ul className="enter-up pointer-events-auto mt-10 grid max-w-[600px] gap-2.5 sm:grid-cols-3" style={{ ['--i' as string]: 4 }}>
            <Point icon={<Store className="h-4 w-4" />} title="Every shop" body="One menu for the whole court" />
            <Point icon={<Wallet className="h-4 w-4" />} title="Pay once" body="A single UPI payment" />
            <Point icon={<BellRing className="h-4 w-4" />} title="Track live" body="A token per shop, pinged when ready" />
          </ul>
        </div>
      </div>

      <div className={failed ? 'hidden' : 'pointer-events-auto absolute bottom-24 right-5 hidden max-w-[300px] md:right-10 lg:block'}>
        <button
          type="button"
          onClick={() => enter(true)}
          className="glass spot lift float-y w-full rounded-[24px] p-5 text-left"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-ink">Try it</p>
          <p className="mt-1.5 text-base font-semibold leading-snug text-ink">Place a demo order and watch your food get cooked and carried to your table.</p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-ink">
            Order in 3D <ArrowRight className="h-4 w-4" />
          </span>
        </button>
      </div>

      <a href="#story" className="pointer-events-auto absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-xs font-medium text-ink-3">
        How it works
        <ArrowDown className="scroll-cue h-4 w-4" />
      </a>
    </div>
  );
}

function Point({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="glass rounded-[18px] px-3.5 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="grid h-6 w-6 place-items-center rounded-[8px] bg-accent-tint text-accent-ink">{icon}</span>
        {title}
      </p>
      <p className="mt-1 text-xs text-ink-3">{body}</p>
    </li>
  );
}
