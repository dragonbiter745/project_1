import { CheckCircle2, ChefHat } from 'lucide-react';
import { cx } from '../../lib/format';
import { selectCartCount, useCart } from '../cart/cartStore';
import { useUi } from '../ui/uiStore';
import { shortStatus, useActiveOrder } from './useActiveOrder';

export function ActiveOrderBar() {
  const { orderId, subOrders } = useActiveOrder();
  const trackingOpen = useUi((s) => s.open.tracking);
  const show = useUi((s) => s.show);
  const cartHasItems = useCart(selectCartCount) > 0;

  const visible = Boolean(orderId) && !trackingOpen;
  const anyReady = subOrders.some((s) => s.status === 'READY');
  const title = anyReady ? 'Ready at the counter' : subOrders.length ? 'Order in progress' : 'Confirming payment';
  const summary = subOrders.map((s) => `${s.token} ${shortStatus(s.status)}`).join(' · ');

  return (
    <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-float px-3">
      {/* Sits above the cart bar when both are showing. */}
      <div
        className="transition-transform duration-300 ease-out"
        style={{ transform: cartHasItems ? 'translateY(-64px)' : undefined }}
      >
        <div data-visible={visible} inert={!visible} className="float-bar pointer-events-auto mx-auto max-w-md">
          <button
            type="button"
            onClick={() => show('tracking')}
            className="pressable flex h-14 w-full items-center gap-3 rounded-full bg-surface pl-2.5 pr-1.5 text-left shadow-float ring-1 ring-inset ring-line"
          >
            <span
              className={cx(
                'grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors duration-300',
                anyReady ? 'bg-ready-tint text-ready' : 'bg-accent-tint text-accent-ink'
              )}
            >
              {anyReady ? (
                <CheckCircle2 className="h-5 w-5" strokeWidth={1.75} />
              ) : (
                <ChefHat className="h-5 w-5" strokeWidth={1.75} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{title}</span>
              {summary && <span className="block truncate font-mono text-xs text-ink-3">{summary}</span>}
            </span>
            <span className="inline-flex h-11 items-center rounded-full bg-surface-2 px-4 text-sm font-semibold text-ink">
              Track
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
