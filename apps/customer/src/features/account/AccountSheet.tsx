import { LogOut } from 'lucide-react';
import { formatPaise, type OrderStatus } from '@foodcourt/shared';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { jsonEqual, useLocal } from '../../lib/store';
import { useProfile } from '../auth/profileStore';
import { useCart } from '../cart/cartStore';
import type { TableSession } from '../session/useTableSession';
import { useUi } from '../ui/uiStore';

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

export function AccountSheet({ session }: { session: TableSession }) {
  const open = useUi((s) => s.open.account);
  const hide = useUi((s) => s.hide);
  const show = useUi((s) => s.show);
  const profile = useProfile((s) => s.profile);
  const signOut = useProfile((s) => s.signOut);
  const setActiveOrder = useCart((s) => s.setActiveOrder);
  const orders = useLocal(
    (s) =>
      Object.values(s.orders)
        .filter((o) => o.sessionId === session.id)
        .sort((a, b) => b.createdAt - a.createdAt),
    jsonEqual
  );

  const close = () => hide('account');

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
              <p className="text-sm tabular-nums text-ink-3">+91 {formatPhone(profile.phone)}</p>
            </div>
          </div>

          <dl className="mt-5 divide-y divide-line rounded-card text-sm ring-1 ring-inset ring-line">
            <div className="flex justify-between gap-3 px-4 py-3">
              <dt className="text-ink-3">Table</dt>
              <dd className="font-medium text-ink">{session.tableLabel}</dd>
            </div>
            {profile.studentId && (
              <div className="flex justify-between gap-3 px-4 py-3">
                <dt className="text-ink-3">Student or staff ID</dt>
                <dd className="font-medium text-ink">{profile.studentId}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 px-4 py-3">
              <dt className="text-ink-3">REVA points</dt>
              <dd className="font-medium text-ink">Earned when you collect</dd>
            </div>
          </dl>

          <h3 className="mt-6 text-base font-semibold text-ink">This visit</h3>
          {orders.length === 0 ? (
            <p className="mt-2 rounded-card bg-bg p-4 text-sm text-ink-3">
              No orders yet. Anything you order at this table shows up here.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line overflow-hidden rounded-card ring-1 ring-inset ring-line">
              {orders.map((order) => (
                <li key={order.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveOrder(order.id);
                      close();
                      show('tracking');
                    }}
                    className="hover-surface flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-medium text-ink">
                        Order #{order.id.slice(-4).toUpperCase()}
                      </span>
                      <span className="block truncate text-sm text-ink-3">
                        {order.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-base font-semibold tabular-nums text-ink">
                        {formatPaise(order.totals.totalPaise)}
                      </span>
                      <span className="block text-xs text-ink-3">{ORDER_STATUS[order.status] ?? order.status}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Sheet>
  );
}
