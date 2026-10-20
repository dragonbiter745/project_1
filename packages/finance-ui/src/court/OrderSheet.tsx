import { useEffect, useState, type ReactNode } from 'react';
import { orderTickets, type LedgerOrder } from '@foodcourt/firebase-client/finance';
import { formatPaise, type SubOrder } from '@foodcourt/shared';
import { Sheet, Skeleton, cx } from '@foodcourt/ui';
import { ORDER_STATUS, formatTime, methodLabel } from '../lib/orderStatus';

const REFUND: Record<string, string> = { PENDING: 'Refund in progress', PROCESSED: 'Refunded', FAILED: 'Refund failed', NOT_REQUIRED: 'No refund needed' };

/** Everything about one payment: gateway ids for Cashfree support, and each shop's ticket with its refund. */
export function OrderSheet({ order, onClose }: { order: LedgerOrder | null; onClose: () => void }) {
  const [tickets, setTickets] = useState<SubOrder[] | null>(null);

  useEffect(() => {
    if (!order) return;
    let live = true;
    setTickets(null);
    orderTickets(order.id).then(
      (t) => live && setTickets(t),
      () => live && setTickets([])
    );
    return () => {
      live = false;
    };
  }, [order]);

  const o = order;
  const status = o ? ORDER_STATUS[(o.payment?.status as string) === 'FLAGGED' ? 'FLAGGED' : o.status] ?? ORDER_STATUS.CREATED : null;

  return (
    <Sheet open={o !== null} onClose={onClose} title={o ? formatPaise(o.totals?.totalPaise ?? 0, true) : ''} description={o ? `Placed ${formatTime(o.createdAt)} at table ${o.tableLabel}` : undefined}>
      {o && status && (
        <div className="space-y-5 px-5 pb-6">
          <span className={cx('inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold', status.tone)}>{status.label}</span>
          <dl className="divide-y divide-line overflow-hidden rounded-card bg-surface-2/60 text-sm ring-1 ring-inset ring-line">
            <Row label="Order ID" value={o.id} mono />
            <Row label="Payment" value={methodLabel(o.payment?.mode, o.payment?.method)} />
            {o.payment?.cfOrderId && <Row label="Cashfree order" value={o.payment.cfOrderId} mono />}
            {o.payment?.cfPaymentId && <Row label="Cashfree payment" value={o.payment.cfPaymentId} mono />}
            {o.payment?.paidAt && <Row label="Paid at" value={formatTime(o.payment.paidAt)} />}
            {o.customerPhone && <Row label="Diner phone" value={o.customerPhone} mono />}
            {o.displayName && <Row label="Diner name" value={o.displayName} />}
            <Row label="Items" value={formatPaise(o.totals?.subtotalPaise ?? 0, true)} />
            {(o.totals?.taxPaise ?? 0) > 0 && <Row label="GST" value={formatPaise(o.totals.taxPaise, true)} />}
            {(o.totals?.platformFeePaise ?? 0) > 0 && <Row label="Platform fee" value={formatPaise(o.totals.platformFeePaise, true)} />}
          </dl>

          <div>
            <h3 className="text-sm font-semibold text-ink">By shop</h3>
            <div className="mt-2 space-y-2">
              {tickets === null ? (
                <Skeleton className="h-20" />
              ) : tickets.length === 0 ? (
                <p className="rounded-card bg-surface-2 px-4 py-3 text-sm text-ink-3">No shop tickets. The kitchens get one only after the payment succeeds.</p>
              ) : (
                tickets.map((t) => (
                  <article key={t.id} className="rounded-card bg-surface px-4 py-3 ring-1 ring-inset ring-line">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-semibold text-ink">
                        {t.vendorName || t.vendorId} <span className="ml-1 font-mono text-xs text-ink-3">{t.token}</span>
                      </p>
                      <p className="font-semibold tabular-nums text-ink">{formatPaise(t.subtotalPaise, true)}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-3">{t.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</p>
                    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
                      <span>Ticket {t.status.toLowerCase().replace('_', ' ')}</span>
                      {t.commissionPaise ? <span>Commission {formatPaise(t.commissionPaise, true)}</span> : null}
                      {t.refund && t.refund.status !== 'NOT_REQUIRED' && (
                        <span className={t.refund.status === 'FAILED' ? 'font-semibold text-danger' : 'text-accent-ink'}>
                          {REFUND[t.refund.status]} {formatPaise(t.refund.amountPaise, true)}
                        </span>
                      )}
                    </p>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Row({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-ink-3">{label}</dt>
      <dd className={cx('min-w-0 break-all text-right font-medium text-ink', mono && 'font-mono text-[13px]')}>{value}</dd>
    </div>
  );
}
