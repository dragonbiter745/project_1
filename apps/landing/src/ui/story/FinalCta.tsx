import { ArrowUpRight, Box } from 'lucide-react';
import { BrandMark } from '@foodcourt/ui';
import { orderAtTable } from '../../lib/links';
import { useReveal } from '../../lib/hooks';
import { useUi } from '../../store/ui';

export function FinalCta() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="bg-bg px-3 pb-6 md:px-6">
      <div ref={ref} className="reveal relative mx-auto max-w-[1280px] overflow-hidden rounded-[40px] bg-[#1a0d06] px-6 py-20 text-center md:py-28">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_20%_10%,rgba(228,87,15,0.55),transparent_60%),radial-gradient(50%_70%_at_85%_90%,rgba(225,29,72,0.45),transparent_60%),radial-gradient(40%_50%_at_60%_40%,rgba(245,158,11,0.3),transparent_70%)]" />
        <div className="grain pointer-events-none absolute inset-0" />
        <div className="relative">
          <BrandMark size="lg" className="mx-auto" />
          <h2 className="mx-auto mt-8 max-w-[16ch] text-4xl font-semibold leading-[1.04] tracking-[-0.035em] text-white md:text-7xl [text-wrap:balance]">Hungry? Your table already knows what to do.</h2>
          <p className="mx-auto mt-5 max-w-[46ch] text-lg text-white/75">Scan the QR on any table at REVA Food Court, or open the menu here and pick your table.</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <a href={orderAtTable()} className="pressable inline-flex h-14 items-center gap-2 rounded-full bg-white px-7 text-base font-semibold text-ink shadow-float hover:bg-white/90">
              Order now
              <ArrowUpRight className="h-5 w-5" strokeWidth={2.25} />
            </a>
            <button
              type="button"
              onClick={() => {
                document.getElementById('live')?.scrollIntoView({ behavior: 'smooth' });
                setTimeout(() => useUi.setState({ explore: true, cameraMode: 'orbit' }), 600);
              }}
              className="pressable inline-flex h-14 items-center gap-2 rounded-full bg-white/10 px-7 text-base font-semibold text-white ring-1 ring-inset ring-white/25 backdrop-blur hover:bg-white/15"
            >
              <Box className="h-5 w-5" strokeWidth={2} />
              Walk the 3D court
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
