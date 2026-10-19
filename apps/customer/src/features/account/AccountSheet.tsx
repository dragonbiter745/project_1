import { LogOut, RotateCcw } from 'lucide-react';
import { calculatePointsEarned, formatPaise, type Order, type OrderStatus } from '@foodcourt/shared';
import { jsonEqual, localStore, useLocal } from '../../lib/store';
import { notify, notifyError } from '../../lib/toast';
import { useProfile } from '../auth/profileStore';
import { useCart } from '../cart/cartStore';
import { useOrderHistory } from '../history/orderHistory';
import { planReorder } from '../history/reorder';
import type { TableSession } from '../session/useTableSession';
import { useUi } from '../ui/uiStore';
import { Button, Sheet } from '@foodcourt/ui';

const ORDER_STATUS: Partial<Record<OrderStatus, string>> = {
  CREATED: 'Created',
  PENDING_PAYMENT: 'Confirming payment',
  PAID: 'Paid',
  FAILED: 'Payment failed',
  EXPIRED: 'Expired',
  COMPLETED: 'Collected',
  PARTIALLY_REFUNDED: 'Partly refunded',
  CANCELLED: 'Cancelled',
};

const formatPhone = (digits: string) => `${digits.slice(0, 5)} ${digits.slice(5)}`;
const formatDay = (ms: number) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(ms);

export function AccountSheet({ session }: { session: TableSession }) {
  const open = useUi((s) => s.open.account);
  const hide = useUi((s) => s.hide);
  const show = useUi((s) => s.show);
  const profile = useProfile((s) => s.profile);
  const signOut = useProfile((s) => s.signOut);
  const setActiveOrder = useCart((s) => s.setActiveOrder);
  const addMany = useCart((s) => s.addMany);
  const historyIds = useOrderHistory((s) => s.orderIds);

  const orders = useLocal(
    (s) =>
      historyIds
        .map((id) => s.orders[id])
        .filter((o): o is Order => Boolean(o))
        .sort((a, b) => b.createdAt - a.createdAt),
    jsonEqual
  );
  // Credited when a sub-order is collected (PRD §7.3), so only collected sub-orders count.
  const points = useLocal((s) => {
    const ids = new Set(historyIds);
    return Object.values(s.subOrders)
      .filter((sub) => ids.has(sub.orderId) && sub.status === 'COLLECTED')
      .reduce((sum, sub) => sum + calculatePointsEarned(sub.subtotalPaise, s.config.pointsPerRupee), 0);
  });

  const thisVisit = orders.filter((o) => o.sessionId === session.id);
  const earlier = orders.filter((o) => o.sessionId !== session.id);

  const close = () => hide('account');

  const openOrder = (order: Order) => {
    setActiveOrder(order.id);
    close();
    show('tracking');
  };

  const reorder = (order: Order) => {
    const { lines, skipped } = planReorder(order, localStore.getState());
    if (lines.length === 0) {
      notifyError("Couldn't reorder", { description: 'None of these dishes are available right now.' });
      return;
    }
    addMany(lines);
    close();
    show('cart');
    if (skipped.length > 0) notify('Some dishes were left out', { description: `Not available now: ${skipped.join(', ')}` });
  };

  return (
    <Sheet
      open={open && Boolean(profile)}
      onClose={close}
      title="Your account"
      footer={
        <Button
          variant="danger"
          block
          icon={<LogOut className="h-4 w-4" strokeWidth={2} />}
          onClick={() => {
            signOut();
            close();
            notify('Signed out');
          }}
        >
          Sign out
        </Button>
      }
    >
      {profile && (
        <>
          <div className="flex items-center gap-3.5">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent-tint text-xl font-semibold text-accent-ink ring-1 ring-inset ring-accent-line">
              {profile.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-ink">{profile.name}</p>
              <p className="text-sm tabular-nums text-ink-3">
                +91 {formatPhone(profile.phone)}
                {profile.studentId && ` · ${profile.studentId}`}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-card bg-accent-tint p-4 ring-1 ring-inset ring-accent-line">
            <p className="text-sm font-medium text-accent-ink">REVA points</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-ink">{points}</p>
            <p className="mt-1 text-sm text-ink-2">From orders you've collected on this phone.</p>
          </div>

          <OrderList
            title="This visit"
            empty="No orders yet. Anything you order at this table shows up here."
            orders={thisVisit}
            onOpen={openOrder}
            onReorder={reorder}
          />
          {earlier.length > 0 && (
            <OrderList title="Earlier" orders={earlier} onOpen={openOrder} onReorder={reorder} showDate />
          )}
        </>
      )}
    </Sheet>
  );
}

interface OrderListProps {
  title: string;
  empty?: string;
  orders: Order[];
  onOpen: (order: Order) => void;
  onReorder: (order: Order) => void;
  showDate?: boolean;
}

function OrderList({ title, empty, orders, onOpen, onReorder, showDate }: OrderListProps) {
  return (
    <section className="mt-6" aria-label={title}>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {orders.length === 0 ? (
        empty && <p className="mt-2 rounded-card bg-bg p-4 text-sm text-ink-3">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-card ring-1 ring-inset ring-line">
          {orders.map((order) => (
            <li key={order.id} className="flex items-center">
              <button
                type="button"
                onClick={() => onOpen(order)}
                className="hover-surface flex min-w-0 flex-1 flex-col items-start px-4 py-3 text-left transition-colors"
              >
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="text-base font-medium text-ink">
                    {showDate ? formatDay(order.createdAt) : `Order #${order.id.slice(-4).toUpperCase()}`}
                  </span>
                  <span className="shrink-0 text-base font-semibold tabular-nums text-ink">
                    {formatPaise(order.totals.totalPaise)}
                  </span>
                </span>
                <span className="mt-0.5 block w-full truncate text-sm text-ink-3">
                  {order.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}
                </span>
                <span className="mt-0.5 text-xs text-ink-3">{ORDER_STATUS[order.status] ?? order.status}</span>
              </button>
              {order.status !== 'PENDING_PAYMENT' && (
                <button
                  type="button"
                  onClick={() => onReorder(order)}
                  aria-label={`Reorder ${order.items.map((i) => i.name).join(', ')}`}
                  className="pressable mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-accent-ink"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-tint ring-1 ring-inset ring-accent-line">
                    <RotateCcw className="h-4 w-4" strokeWidth={2} />
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
