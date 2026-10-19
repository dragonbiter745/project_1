import { formatPaise, type Order, type SubOrder } from '@foodcourt/shared';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { cx } from '../../lib/format';
import { useCart } from '../cart/cartStore';
import type { TableSession } from '../session/useTableSession';
import { useUi } from '../ui/uiStore';
import { STEP_LABELS, isClosedWithRefund, stepIndex, useActiveOrder, useReadyAlert } from './useActiveOrder';

export function TrackingSheet({ session }: { session: TableSession }) {
  const open = useUi((s) => s.open.tracking);
  const hide = useUi((s) => s.hide);
  const setActiveOrder = useCart((s) => s.setActiveOrder);
  const { orderId, order, subOrders } = useActiveOrder();
  useReadyAlert(subOrders);

  const finished =
    subOrders.length > 0 && subOrders.every((s) => s.status === 'COLLECTED' || isClosedWithRefund(s.status));

  const close = () => hide('tracking');

  return (
    <Sheet
      open={open && Boolean(orderId)}
      onClose={close}
      title={orderId ? `Order #${orderId.slice(-4).toUpperCase()}` : 'Your order'}
      description={`Table ${session.tableLabel} · ${session.displayName}`}
      footer={
        finished ? (
          <Button
            size="lg"
            block
            onClick={() => {
              setActiveOrder(null);
              close();
            }}
          >
            Done
          </Button>
        ) : (
          <Button size="lg" variant="outline" block onClick={close}>
            Order more
          </Button>
        )
      }
    >
      {subOrders.length === 0 ? (
        <PaymentPending order={order} />
      ) : (
        <div className="space-y-3">
          {subOrders.map((sub) => (
            <SubOrderCard key={sub.id} sub={sub} displayName={session.displayName} />
          ))}
        </div>
      )}
    </Sheet>
  );
}

function PaymentPending({ order }: { order: Order | null }) {
  const failed = order?.status === 'FAILED' || order?.status === 'EXPIRED';
  if (failed) {
    return (
      <div className="px-4 py-10 text-center" role="alert">
        <p className="text-base font-semibold text-ink">Payment didn't go through</p>
        <p className="mt-1 text-sm text-ink-3">If any amount was debited, it will be refunded automatically.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center" aria-live="polite">
      <span className="spinner block h-8 w-8 rounded-full border-[3px] border-accent border-r-transparent" aria-hidden />
      <p className="mt-5 text-base font-semibold text-ink">Confirming your payment</p>
      <p className="mt-1 text-sm text-ink-3">This usually takes a few seconds. Keep this screen open.</p>
    </div>
  );
}

function statusMessage(sub: SubOrder, displayName: string): string {
  const shop = sub.vendorName ?? 'shop';
  switch (sub.status) {
    case 'NEW':
      return `Waiting for ${shop} to accept your order.`;
    case 'ACCEPTED':
      return `${shop} accepted your order.`;
    case 'PREPARING':
      return `${shop} is preparing your food.`;
    case 'READY':
      return `${displayName}, your ${shop} order is ready at the counter.`;
    case 'COLLECTED':
      return 'Collected. Enjoy your meal.';
    case 'REJECTED':
      return `${shop} couldn't take this order. Your refund is on its way.`;
    case 'TIMED_OUT':
      return `${shop} didn't respond in time. Your refund is on its way.`;
    case 'CANCELLED':
      return 'This part of your order was cancelled. Your refund is on its way.';
    default:
      return '';
  }
}

function SubOrderCard({ sub, displayName }: { sub: SubOrder; displayName: string }) {
  const index = stepIndex(sub.status);
  const ready = sub.status === 'READY';
  const done = sub.status === 'COLLECTED';
  const closed = isClosedWithRefund(sub.status);

  return (
    <article
      className={cx(
        'rounded-card p-4 ring-1 ring-inset transition-colors duration-500',
        ready ? 'bg-ready-tint ring-ready/25' : closed ? 'bg-danger-tint ring-danger/20' : 'bg-surface ring-line'
      )}
    >
      <p className="text-sm font-medium text-ink-3">{sub.vendorName}</p>
      <p className="mt-0.5 font-mono text-3xl font-semibold tracking-tight text-ink">{sub.token}</p>
      <p className={cx('mt-2 text-sm', ready ? 'font-semibold text-ready' : 'text-ink-2')} aria-live="polite">
        {statusMessage(sub, displayName)}
      </p>

      {!closed && (
        <div className="mt-4">
          <div className="grid grid-cols-4 gap-1.5" aria-hidden>
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className={cx('progress-fill h-full', ready || done ? 'bg-ready' : 'bg-accent')}
                  style={{ transform: `scaleX(${i <= index ? 1 : 0})` }}
                />
              </div>
            ))}
          </div>
          <ol className="mt-1.5 grid grid-cols-4 text-2xs text-ink-3">
            {STEP_LABELS.map((label, i) => (
              <li key={label} className={cx(i === index && 'font-semibold text-ink')} aria-current={i === index ? 'step' : undefined}>
                {label}
              </li>
            ))}
          </ol>
        </div>
      )}

      <ul className="mt-4 space-y-1 border-t border-ink/10 pt-3 text-sm text-ink-2">
        {sub.items.map((item, i) => (
          <li key={`${item.id}-${i}`} className="flex justify-between gap-3">
            <span className="min-w-0">
              {item.qty} × {item.name}
            </span>
            <span className="shrink-0 tabular-nums">{formatPaise(item.pricePaise * item.qty)}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
