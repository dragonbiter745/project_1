import { useEffect, useMemo, useState } from 'react';
import { Copy, MessageSquareWarning, Printer, Radio, ReceiptText, RotateCcw, Share2, ShoppingBag } from 'lucide-react';
import { formatPaise, placeName, type Order, type SubOrder, type SubOrderStatus } from '@foodcourt/shared';
import { Button } from '@foodcourt/ui';
import { useAuth } from '../../lib/authStore';
import { cx } from '../../lib/format';
import { jsonEqual, useLocal } from '../../lib/store';
import { notify } from '../../lib/toast';
import { ReportProblemSheet, type ReportTarget } from '../tracking/ReportProblemSheet';
import { reorder, shopsOf, track, useHub, useMyOrders, useVendorNames } from './data';
import { Empty, ORDER_STATUS, Pill, dayFormat, isLive, shortOrderNo, timeFormat } from './hubParts';

type Filter = 'all' | 'live' | 'refunds';
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Ongoing' },
  { key: 'refunds', label: 'Refunds' },
];

const live = () => import('@foodcourt/firebase-client/live');

export function OrdersScreen() {
  const { push, closeHub } = useHub();
  const orders = useMyOrders();
  const names = useVendorNames();
  const uid = useAuth((s) => s.user?.uid);
  const [filter, setFilter] = useState<Filter>('all');
  const [more, setMore] = useState<'idle' | 'loading' | 'done'>('idle');

  const shown = useMemo(
    () =>
      orders.filter((o) =>
        filter === 'live' ? isLive(o) : filter === 'refunds' ? o.status === 'PARTIALLY_REFUNDED' || o.status === 'CANCELLED' : true
      ),
    [orders, filter]
  );
  // Grouped by IST day, newest first.
  const days = useMemo(() => {
    const out: Array<{ key: string; orders: Order[] }> = [];
    for (const o of shown) {
      const key = dayFormat.format(o.createdAt);
      const last = out[out.length - 1];
      if (last?.key === key) last.orders.push(o);
      else out.push({ key, orders: [o] });
    }
    return out;
  }, [shown]);

  const loadMore = async () => {
    const oldest = orders[orders.length - 1];
    if (!uid || !oldest || more === 'loading') return;
    setMore('loading');
    try {
      const n = await (await live()).fetchOrdersBefore(uid, oldest.createdAt);
      setMore(n < 20 ? 'done' : 'idle');
    } catch {
      setMore('idle');
      notify("Couldn't load older orders", { description: 'Check your connection and try again.' });
    }
  };

  return (
    <>
      <div role="tablist" aria-label="Filter orders" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cx(
              'pressable h-9 shrink-0 rounded-full px-4 text-sm font-medium ring-1 ring-inset transition-colors duration-150',
              filter === f.key ? 'bg-ink text-surface ring-ink' : 'bg-surface text-ink-2 ring-line'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Empty
          icon={ShoppingBag}
          title={filter === 'all' ? 'No orders yet' : filter === 'live' ? 'Nothing cooking right now' : 'No refunds'}
          text={filter === 'all' ? 'Everything you order shows up here, with receipts and one-tap reorder.' : 'Orders that match will show up here.'}
          action={
            filter === 'all' && (
              <Button variant="outline" onClick={closeHub}>
                Browse the menu
              </Button>
            )
          }
        />
      ) : (
        days.map((day) => (
          <section key={day.key} className="mt-6" aria-label={day.key}>
            <h3 className="px-1 pb-2 text-sm font-medium text-ink-3">{day.key}</h3>
            <ul className="space-y-2.5">
              {day.orders.map((o) => (
                <li key={o.id}>
                  <OrderCard order={o} shops={shopsOf(o, names)} onOpen={() => push({ name: 'order', id: o.id })} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {uid && orders.length >= 20 && more !== 'done' && filter === 'all' && (
        <Button variant="ghost" block className="mt-4" loading={more === 'loading'} onClick={() => void loadMore()}>
          Show older orders
        </Button>
      )}
    </>
  );
}

function OrderCard({ order, shops, onOpen }: { order: Order; shops: string; onOpen: () => void }) {
  const { closeHub } = useHub();
  const status = ORDER_STATUS[order.status];
  const items = order.items.reduce((n, i) => n + i.qty, 0);
  return (
    <div className="overflow-hidden rounded-card bg-surface ring-1 ring-inset ring-line/70">
      <button type="button" onClick={onOpen} className="hover-surface block w-full px-4 pb-3 pt-3.5 text-left transition-colors">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold text-ink">{shops}</span>
            <span className="block text-sm tabular-nums text-ink-3">
              {timeFormat.format(order.createdAt)} · {shortOrderNo(order.id)} · {items} {items === 1 ? 'item' : 'items'}
            </span>
          </span>
          <Pill tone={status.tone}>{status.label}</Pill>
        </span>
        <span className="mt-2 line-clamp-2 block text-sm text-ink-2">{order.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</span>
      </button>
      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2">
        <span className="text-base font-semibold tabular-nums text-ink">{formatPaise(order.totals.totalPaise)}</span>
        {isLive(order) ? (
          <Button size="sm" variant="tint" icon={<Radio className="h-4 w-4" />} onClick={() => track(order.id, closeHub)}>
            Track
          </Button>
        ) : (
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => reorder(order, closeHub)}>
            Reorder
          </Button>
        )}
      </div>
    </div>
  );
}

const TICKET_STATUS: Record<SubOrderStatus, string> = {
  NEW: 'Waiting for the shop',
  ACCEPTED: 'Accepted',
  PREPARING: 'Being prepared',
  READY: 'Ready at the counter',
  COLLECTED: 'Collected',
  REJECTED: "The shop couldn't take it",
  TIMED_OUT: "The shop didn't respond",
  CANCELLED: 'Cancelled',
};

function refundText(t: SubOrder): string | null {
  const r = t.refund;
  if (!r) return null;
  if (r.status === 'NOT_REQUIRED') return 'Nothing was charged for this part';
  if (r.status === 'PROCESSED') return `Refunded ${formatPaise(r.amountPaise)}`;
  if (r.status === 'FAILED') return `Refund of ${formatPaise(r.amountPaise)} delayed. We're on it`;
  return `Refund of ${formatPaise(r.amountPaise)} on its way`;
}

/** Loads a past order's kitchen tickets once, for the detail and the receipt. */
export function useTickets(order: Order | undefined): SubOrder[] {
  const uid = useAuth((s) => s.user?.uid);
  const orderId = order?.id;
  const tickets = useLocal((s) => (orderId ? Object.values(s.subOrders).filter((t) => t.orderId === orderId) : []), jsonEqual);
  const needed = Boolean(orderId && uid && tickets.length === 0 && order?.status !== 'PENDING_PAYMENT');
  useEffect(() => {
    if (!needed || !orderId || !uid) return;
    void live()
      .then((l) => l.fetchTickets(uid, orderId))
      .catch(() => undefined);
  }, [needed, orderId, uid]);
  return useMemo(() => [...tickets].sort((a, b) => (a.vendorName ?? '').localeCompare(b.vendorName ?? '')), [tickets]);
}

export function OrderDetailScreen({ id }: { id: string }) {
  const { push, closeHub } = useHub();
  const order = useLocal((s) => s.orders[id]);
  const tickets = useTickets(order);
  const [report, setReport] = useState<ReportTarget | null>(null);
  if (!order) return <Empty icon={ReceiptText} title="Order not found" text="It may have been placed from another account." />;

  const status = ORDER_STATUS[order.status];
  const refunded = tickets.reduce((n, t) => n + (t.refund?.status === 'PROCESSED' || t.refund?.status === 'PENDING' ? t.refund.amountPaise : 0), 0);
  const online = order.payment.mode !== 'COUNTER';

  const copyId = () => {
    void navigator.clipboard?.writeText(order.id).then(() => notify('Order ID copied'));
  };

  return (
    <>
      <div className="rounded-card bg-surface p-4 ring-1 ring-inset ring-line/70">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-2xl font-semibold tabular-nums tracking-tight text-ink">{formatPaise(order.totals.totalPaise)}</p>
            <p className="mt-0.5 text-sm text-ink-3">
              {dayFormat.format(order.createdAt)}, {timeFormat.format(order.createdAt)} · {placeName(order)}
            </p>
          </div>
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {isLive(order) ? (
            <Button variant="accent" icon={<Radio className="h-4 w-4" />} onClick={() => track(order.id, closeHub)}>
              Track live
            </Button>
          ) : (
            <Button variant="accent" icon={<RotateCcw className="h-4 w-4" />} onClick={() => reorder(order, closeHub)}>
              Reorder
            </Button>
          )}
          <Button variant="outline" icon={<ReceiptText className="h-4 w-4" />} onClick={() => push({ name: 'receipt', id: order.id })}>
            Receipt
          </Button>
        </div>
      </div>

      <h3 className="mt-6 px-1 pb-2 text-sm font-medium text-ink-3">From each shop</h3>
      {tickets.length === 0 ? (
        <div className="shimmer h-28 rounded-card" aria-busy="true" aria-label="Loading tickets" />
      ) : (
        <ul className="space-y-2.5">
          {tickets.map((t) => {
            const refund = refundText(t);
            return (
              <li key={t.id} className="rounded-card bg-surface p-4 ring-1 ring-inset ring-line/70">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-ink">{t.vendorName}</p>
                    <p className="text-sm text-ink-3">{TICKET_STATUS[t.status]}</p>
                  </div>
                  <span className="shrink-0 rounded-field bg-surface-2 px-2.5 py-1 font-mono text-base font-semibold text-ink">{t.token}</span>
                </div>
                <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm text-ink-2">
                  {t.items.map((item, i) => (
                    <li key={`${item.id}-${i}`} className="flex justify-between gap-3">
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        {item.qty} × {item.name}
                        {item.note && <span className="block text-xs text-ink-3">Note: {item.note}</span>}
                      </span>
                      <span className="shrink-0 tabular-nums">{formatPaise(item.pricePaise * item.qty)}</span>
                    </li>
                  ))}
                </ul>
                {refund && <p className="mt-3 rounded-field bg-danger-tint px-3 py-2 text-sm font-medium text-danger">{refund}</p>}
                <button
                  type="button"
                  onClick={() => setReport({ orderId: order.id, subOrderId: t.id, vendorId: t.vendorId, vendorName: t.vendorName })}
                  className="-mb-2 -ml-1 mt-1 inline-flex h-11 items-center gap-1.5 px-1 text-sm font-medium text-ink-3"
                >
                  <MessageSquareWarning className="h-4 w-4" strokeWidth={1.75} />
                  Get help with this
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="mt-6 px-1 pb-2 text-sm font-medium text-ink-3">Bill</h3>
      <dl className="space-y-2.5 rounded-card bg-surface p-4 text-sm ring-1 ring-inset ring-line/70">
        <BillRow label="Item total" value={formatPaise(order.totals.subtotalPaise)} />
        <BillRow label="GST" value={order.totals.taxPaise > 0 ? `${formatPaise(order.totals.taxPaise)} included` : 'Included'} muted />
        {order.totals.platformFeePaise > 0 && <BillRow label="Platform fee" value={formatPaise(order.totals.platformFeePaise)} />}
        {order.coupon && <CouponLine code={order.coupon.code} paise={order.coupon.discountPaise} />}
        <div className="flex justify-between border-t border-line pt-3 text-base font-semibold text-ink">
          <dt>{online ? 'Paid' : 'Paid at the counter'}</dt>
          <dd className="tabular-nums">{formatPaise(order.totals.totalPaise)}</dd>
        </div>
        {refunded > 0 && <BillRow label="Refunded" value={`− ${formatPaise(refunded)}`} />}
      </dl>

      <dl className="mt-3 space-y-2.5 rounded-card bg-surface p-4 text-sm ring-1 ring-inset ring-line/70">
        <BillRow label="Payment" value={online ? `Online${order.payment.method ? ` · ${order.payment.method}` : ''}` : 'At the shop counter'} />
        {order.payment.paidAt && <BillRow label="Paid at" value={`${dayFormat.format(order.payment.paidAt)}, ${timeFormat.format(order.payment.paidAt)}`} />}
        <div className="flex items-center justify-between gap-3 text-ink-2">
          <dt>Order ID</dt>
          <dd>
            <button type="button" onClick={copyId} className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-2 hover:text-ink">
              {order.id}
              <Copy className="h-3.5 w-3.5" />
            </button>
          </dd>
        </div>
      </dl>

      <ReportProblemSheet target={report} onClose={() => setReport(null)} />
    </>
  );
}

function CouponLine({ code, paise }: { code: string; paise: number }) {
  return (
    <div className="flex justify-between gap-3 font-medium text-ready">
      <dt>Coupon {code}</dt>
      <dd className="tabular-nums">− {formatPaise(paise)}</dd>
    </div>
  );
}

function BillRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cx('flex justify-between gap-3', muted ? 'text-ink-3' : 'text-ink-2')}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** A clean receipt that prints (or saves as PDF) on its own. */
export function ReceiptScreen({ id }: { id: string }) {
  const order = useLocal((s) => s.orders[id]);
  const tickets = useTickets(order);
  const gstPct = useLocal((s) => s.config.gstPct);
  if (!order) return <Empty icon={ReceiptText} title="Receipt not found" text="Open it again from your orders." />;
  const online = order.payment.mode !== 'COUNTER';

  const share = async () => {
    const lines = [
      `REVA Food Court · Receipt ${shortOrderNo(order.id)}`,
      `${dayFormat.format(order.createdAt)}, ${timeFormat.format(order.createdAt)} · ${placeName(order)}`,
      ...order.items.map((i) => `${i.qty} × ${i.name}  ${formatPaise(i.pricePaise * i.qty)}`),
      `Total ${formatPaise(order.totals.totalPaise)} (GST included)`,
    ];
    try {
      await navigator.share({ title: `Receipt ${shortOrderNo(order.id)}`, text: lines.join('\n') });
    } catch {
      // the diner closed the share sheet
    }
  };

  const lines = (items: Array<{ key: string; qty: number; name: string; pricePaise: number }>) => (
    <ul className="mt-1.5 space-y-1 text-sm text-ink-2">
      {items.map((item) => (
        <li key={item.key} className="flex justify-between gap-3">
          <span>
            {item.qty} × {item.name}
          </span>
          <span className="tabular-nums">{formatPaise(item.pricePaise * item.qty)}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <article data-print-root className="rounded-card bg-surface p-5 ring-1 ring-inset ring-line/70">
        <header className="border-b border-dashed border-line-strong pb-4 text-center">
          <p className="text-lg font-semibold tracking-tight text-ink">REVA Food Court</p>
          <p className="text-sm text-ink-3">Receipt {shortOrderNo(order.id)}</p>
          <p className="mt-1 text-sm tabular-nums text-ink-3">
            {dayFormat.format(order.createdAt)}, {timeFormat.format(order.createdAt)} · {placeName(order)}
          </p>
        </header>
        {tickets.length > 0 ? (
          tickets.map((t) => (
            <section key={t.id} className="border-b border-dashed border-line-strong py-3">
              <p className="flex justify-between text-sm font-semibold text-ink">
                <span>{t.vendorName}</span>
                <span className="font-mono">{t.token}</span>
              </p>
              {lines(t.items.map((item, i) => ({ key: `${item.id}-${i}`, ...item })))}
            </section>
          ))
        ) : (
          <section className="border-b border-dashed border-line-strong py-3">{lines(order.items.map((item, i) => ({ key: `${item.itemId}-${i}`, ...item })))}</section>
        )}
        <dl className="space-y-1.5 pt-3 text-sm">
          <BillRow label="Item total" value={formatPaise(order.totals.subtotalPaise)} />
          <BillRow label={`GST (${gstPct}%) included`} value={formatPaise(order.totals.taxPaise)} muted />
          {order.totals.platformFeePaise > 0 && <BillRow label="Platform fee" value={formatPaise(order.totals.platformFeePaise)} />}
          {order.coupon && <CouponLine code={order.coupon.code} paise={order.coupon.discountPaise} />}
          <div className="flex justify-between pt-1 text-base font-semibold text-ink">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatPaise(order.totals.totalPaise)}</dd>
          </div>
          <BillRow label="Paid by" value={online ? `Online${order.payment.method ? ` (${order.payment.method})` : ''}` : 'At the shop counter'} muted />
          {order.payment.cfPaymentId && <BillRow label="Payment ref." value={order.payment.cfPaymentId} muted />}
        </dl>
        <p className="mt-4 text-center text-xs text-ink-3">Thank you for eating with us.</p>
      </article>
      <div data-print="hide" className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
          Print or PDF
        </Button>
        {'share' in navigator && (
          <Button variant="outline" icon={<Share2 className="h-4 w-4" />} onClick={() => void share()}>
            Share
          </Button>
        )}
      </div>
    </>
  );
}
