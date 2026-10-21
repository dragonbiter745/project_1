import { useEffect, useRef } from 'react';
import { formatPaise } from '@foodcourt/shared';
import type { MoneyScene } from '../login/moneyScene';

/**
 * The login's 3D rupees as the Money page's background: one fixed full-screen canvas behind the
 * page. This and the sign-in are the only places the money appears. three.js loads after the page is
 * on screen; with no WebGL or reduced motion the page is simply plain.
 */
export function MoneyBackdrop() {
  const layerRef = useRef<HTMLDivElement>(null);

  // Each scene gets its own canvas so a remount never shares a WebGL context with one being disposed.
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let alive = true;
    let scene: MoneyScene | null = null;
    const canvas = document.createElement('canvas');
    canvas.className = 'h-full w-full';
    layerRef.current?.appendChild(canvas);
    import('../login/moneyScene')
      .then(({ createMoneyScene }) => createMoneyScene(canvas, () => null))
      .then((s) => {
        if (!alive) return s.dispose();
        scene = s;
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      scene?.dispose();
      canvas.remove();
    };
  }, []);

  return <div ref={layerRef} className="pointer-events-none fixed inset-0 z-0 opacity-50" aria-hidden />;
}

/** What the court owes the shop, big and plain, sitting above the backdrop. */
export function BalanceCard({ balancePaise }: { balancePaise: number | null }) {
  return (
    <section className="rounded-sheet bg-surface/95 p-6 text-center shadow-float ring-1 ring-inset ring-line/70 backdrop-blur-sm" aria-label="Balance">
      <p className="text-sm font-medium text-ink-3">The court owes you</p>
      <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-ink">{balancePaise === null ? '…' : formatPaise(balancePaise)}</p>
      <p className="mt-1 text-xs text-ink-3">Everything sold minus commission and payouts so far</p>
    </section>
  );
}
