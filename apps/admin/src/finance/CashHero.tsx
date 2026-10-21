import { useEffect, useRef } from 'react';
import { formatPaise } from '@foodcourt/shared';
import type { MoneyScene } from '../login/moneyScene';

/**
 * "The court owes you" with the login's 3D rupees drifting around it. three.js loads after the
 * card is on screen; with no WebGL or reduced motion the card simply stands alone.
 */
export function CashHero({ balancePaise }: { balancePaise: number | null }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Each scene gets its own canvas so a remount never shares a WebGL context with one being disposed.
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let alive = true;
    let scene: MoneyScene | null = null;
    const canvas = document.createElement('canvas');
    canvas.className = 'h-full w-full';
    layerRef.current?.appendChild(canvas);
    import('../login/moneyScene')
      .then(({ createMoneyScene }) => createMoneyScene(canvas, () => cardRef.current))
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

  return (
    <section className="relative grid min-h-[260px] place-items-center overflow-hidden rounded-sheet bg-surface-2/60 px-4 py-10 ring-1 ring-inset ring-line/70" aria-label="Balance">
      <div ref={layerRef} className="pointer-events-none absolute inset-0" aria-hidden />
      <div ref={cardRef} className="relative z-10 w-full max-w-xs rounded-sheet bg-surface p-5 text-center shadow-float ring-1 ring-inset ring-line/70">
        <p className="text-sm font-medium text-ink-3">The court owes you</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-ink">{balancePaise === null ? '…' : formatPaise(balancePaise)}</p>
        <p className="mt-1 text-xs text-ink-3">Everything sold minus commission and payouts so far</p>
      </div>
    </section>
  );
}
