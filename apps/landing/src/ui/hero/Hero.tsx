import { Component, Suspense, lazy, useEffect, useRef, type ReactNode } from 'react';
import { TABLE_BY_ID } from '../../data/layout';
import { useUi } from '../../store/ui';
import { HeroOverlay } from './HeroOverlay';
import { Hud } from './Hud';
import { Loader } from './Loader';

const World = lazy(() => import('../../scene/World'));

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Any crash inside the 3D scene leaves the rest of the page working. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.error('3D scene failed', error);
    useUi.setState({ sceneFailed: true, explore: false });
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Backdrop() {
  return (
    <div className="field-saffron absolute inset-0">
      <div className="dot-grid absolute inset-0 opacity-60" />
      <div className="absolute -right-24 top-1/4 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgb(185_92_60/0.16),transparent_65%)]" />
    </div>
  );
}

export function Hero() {
  const explore = useUi((s) => s.explore);
  const ready = useUi((s) => s.sceneReady);
  const failed = useUi((s) => s.sceneFailed);
  const section = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!webglAvailable()) useUi.setState({ sceneFailed: true });
  }, []);

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
      else s.set({ explore: false, cameraMode: 'orbit', orderOpen: false, dataOpen: false });
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
        {failed ? (
          <Backdrop />
        ) : (
          <div className="absolute inset-0">
            <SceneBoundary>
              <Suspense fallback={null}>
                <World />
              </Suspense>
            </SceneBoundary>
          </div>
        )}
        {!ready && !failed && (
          <>
            <Backdrop />
            <Loader />
          </>
        )}
        {explore && !failed ? <Hud /> : <HeroOverlay />}
      </div>
    </section>
  );
}
