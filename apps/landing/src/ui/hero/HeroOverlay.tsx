import { ArrowDown, ArrowRight, Box, ChefHat, Clock3, QrCode, Users } from 'lucide-react';
import { orderAtTable } from '../../lib/links';
import { useUi } from '../../store/ui';
import { formatClock, waitLabel } from '../format';

export function HeroOverlay() {
  const snap = useUi((s) => s.snapshot);
  const enter = (order = false) => useUi.setState({ explore: true, cameraMode: order ? 'orbit' : 'cinematic', orderOpen: order });

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* Legibility wash on the text side only, so the court stays visible. */}
      <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-white/85 via-white/45 to-transparent md:w-[62%]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />

      <div className="relative mx-auto flex h-full max-w-[1320px] flex-col justify-center px-5 pb-28 pt-24 md:px-10">
        <div className="max-w-[640px]">
          <p className="enter-up glass pointer-events-auto inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium text-ink-2" style={{ ['--i' as string]: 0 }}>
            <span className="live-dot h-2 w-2 rounded-full bg-ready" aria-hidden />
            Live court · {snap ? formatClock(snap.clockMinutes) : 'opening'} · {snap?.diners ?? 0} diners inside
          </p>
          <h1 className="enter-up mt-6 text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] text-ink sm:text-6xl lg:text-[76px]" style={{ ['--i' as string]: 1 }}>
            Every kitchen.
            <br />
            One QR.
            <br />
            <span className="text-gradient">One payment.</span>
          </h1>
          <p className="enter-up mt-6 max-w-[52ch] text-lg leading-relaxed text-ink-2" style={{ ['--i' as string]: 2 }}>
            At REVA Food Court you order from all eight shops in a single cart, pay once by UPI and follow every token live from your table. No queue, nothing to install.
          </p>
          <div className="enter-up pointer-events-auto mt-8 flex flex-wrap gap-3" style={{ ['--i' as string]: 3 }}>
            <button
              type="button"
              onClick={() => enter(false)}
              className="pressable group inline-flex h-14 items-center gap-2.5 rounded-full bg-ink pl-6 pr-5 text-base font-semibold text-white shadow-float transition-[background-color,box-shadow] hover:bg-black"
            >
              <Box className="h-5 w-5" strokeWidth={2} />
              Explore the live court
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2.25} />
            </button>
            <a
              href={orderAtTable()}
              className="pressable glass inline-flex h-14 items-center gap-2.5 rounded-full px-6 text-base font-semibold text-ink transition-colors hover:bg-white/90"
            >
              <QrCode className="h-5 w-5 text-accent-ink" strokeWidth={2} />
              Order from your table
            </a>
          </div>

          <dl className="enter-up pointer-events-auto mt-10 grid max-w-[560px] grid-cols-3 gap-2.5" style={{ ['--i' as string]: 4 }}>
            <Kpi icon={<ChefHat className="h-4 w-4" />} label="Orders this hour" value={String(snap?.ordersThisHour ?? '–')} />
            <Kpi icon={<Clock3 className="h-4 w-4" />} label="Average wait" value={waitLabel(snap?.avgWaitMin ?? null)} />
            <Kpi icon={<Users className="h-4 w-4" />} label="Tables taken" value={snap ? `${snap.tablesOccupied}/${snap.tablesTotal}` : '–'} />
          </dl>
        </div>
      </div>

      <div className="pointer-events-auto absolute bottom-24 right-5 hidden max-w-[300px] md:right-10 lg:block">
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

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass rounded-[18px] px-3.5 py-3">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <span className="text-accent-ink">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-ink">{value}</dd>
    </div>
  );
}
