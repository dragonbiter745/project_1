import { Suspense, lazy, useEffect, useRef } from 'react';
import { TABLE_BY_ID } from '../../data/layout';
import { useUi } from '../../store/ui';
import { HeroOverlay } from './HeroOverlay';
import { Hud } from './Hud';
import { Loader } from './Loader';

const World = lazy(() => import('../../scene/World'));

export function Hero() {
  const explore = useUi((s) => s.explore);
  const ready = useUi((s) => s.sceneReady);
  const section = useRef<HTMLElement>(null);

  // Pause the 3D while the hero is scrolled out of view.
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => useUi.setState({ heroVisible: Boolean(e?.isIntersecting) }), { threshold: 0.02 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // QR plates link here as ?table=T12: open the court ready to order for that table.
  useEffect(() => {
    const table = new URLSearchParams(window.location.search).get('table')?.toUpperCase();
    if (table && TABLE_BY_ID[table]) {
      useUi.setState({ explore: true, orderOpen: true, presetTable: table, cameraMode: 'orbit' });
      useUi.getState().select({ kind: 'table', id: table });
    }
  }, []);

  useEffect(() => {
    if (!explore) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const s = useUi.getState();
      if (s.selection) s.select(null);
      else s.set({ explore: false, cameraMode: 'cinematic', orderOpen: false, dataOpen: false });
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [explore]);

  return (
    <section ref={section} id="live" aria-label="Live 3D food court" className="relative h-[100dvh] min-h-[600px] w-full">
      <div className={explore ? 'fixed inset-0 z-50 bg-[#d6dee4]' : 'absolute inset-0 overflow-hidden bg-[#d6dee4]'}>
        <div className="absolute inset-0">
          <Suspense fallback={null}>
            <World />
          </Suspense>
        </div>
        {!ready && <Loader />}
        {explore ? <Hud /> : <HeroOverlay />}
      </div>
    </section>
  );
}
