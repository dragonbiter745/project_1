import { ArrowUpRight, Box } from 'lucide-react';
import { BrandMark } from '@foodcourt/ui';
import { orderOnline } from '../../lib/links';
import { useReveal } from '../../lib/hooks';
import { useUi } from '../../store/ui';

export function FinalCta() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="bg-bg px-3 pb-6 md:px-6">
      <div ref={ref} className="reveal relative mx-auto max-w-[1280px] overflow-hidden rounded-[40px] bg-ink px-6 py-20 text-center md:py-28">
        <div className="pointer-events-none absolute inset-0 " />
        <div className="grain pointer-events-none absolute inset-0" />
        <div className="relative">
          <BrandMark size="lg" className="mx-auto" />
          <h2 className="mx-auto mt-8 max-w-[16ch] font-display text-5xl font-extrabold leading-[0.95] text-white md:text-8xl [text-wrap:balance]">Hungry? Every counter, one cart.</h2>
          <p className="mx-auto mt-5 max-w-[46ch] text-lg text-white/75">Order online and collect at the counter, or scan the QR on any table to order from your seat.</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <a href={orderOnline()} className="pressable inline-flex h-14 items-center gap-2 rounded-full bg-accent px-7 text-base font-semibold text-on-accent shadow-float hover:bg-accent-ink">
              Order online
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
