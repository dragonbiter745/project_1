import { useEffect, useMemo, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { computeOrderTotals, formatPaise } from '@foodcourt/shared';
import { pluralize, prefersReducedMotion } from '../../lib/format';
import { jsonEqual, useLocal } from '../../lib/store';
import { useUi } from '../ui/uiStore';
import { selectCartCount, useCart } from './cartStore';

export function CartBar() {
  const count = useCart(selectCartCount);
  const items = useCart((s) => s.items);
  const config = useLocal((s) => s.config, jsonEqual);
  const show = useUi((s) => s.show);
  const total = useMemo(
    () => computeOrderTotals({ items: Object.values(items), config }).totalPaise,
    [items, config]
  );

  const buttonRef = useRef<HTMLButtonElement>(null);
  const previousCount = useRef(count);
  useEffect(() => {
    // A small bump confirms the add landed; skipped on first appearance (the slide-in covers that).
    if (count > previousCount.current && previousCount.current > 0 && !prefersReducedMotion()) {
      buttonRef.current?.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }],
        { duration: 240, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
      );
    }
    previousCount.current = count;
  }, [count]);

  const visible = count > 0;

  return (
    <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-float px-3">
      <div data-visible={visible} inert={!visible} className="float-bar pointer-events-auto mx-auto max-w-md">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => show('cart')}
          aria-label={`View cart: ${pluralize(count, 'item')}, ${formatPaise(total)}`}
          className="pressable flex h-14 w-full items-center justify-between rounded-full bg-ink pl-5 pr-1.5 text-white shadow-float"
        >
          <span className="flex items-center gap-2 text-base font-semibold tabular-nums">
            <span>{pluralize(count, 'item')}</span>
            <span className="text-white/40" aria-hidden>
              ·
            </span>
            <span className="overflow-hidden">
              <span key={total} className="tick inline-block">
                {formatPaise(total)}
              </span>
            </span>
          </span>
          <span className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-semibold">
            View cart
            <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
          </span>
        </button>
      </div>
    </div>
  );
}
