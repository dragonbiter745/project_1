import { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, Banknote, Download, Inbox, Landmark, ReceiptText, RefreshCw, RotateCcw, Wallet } from 'lucide-react';
import { allShopTickets, getShopReport, listShopPayouts, listShopTickets, type TicketPage } from '@foodcourt/firebase-client/finance';
import { formatPaise, type Payout, type ShopFinance as ShopFigures, type SubOrder } from '@foodcourt/shared';
import { Button, Skeleton, cx, run } from '@foodcourt/ui';
import { KpiTile } from '../components/KpiTile';
import { LoadError } from '../components/LoadError';
import { downloadCsv, rupees } from '../lib/csv';
import { formatTime } from '../lib/orderStatus';
import { formatDay, type Range } from '../lib/range';

const money = (p: number) => formatPaise(p, p % 100 !== 0);

const TICKET: Record<string, { label: string; tone: string }> = {
  NEW: { label: 'New', tone: 'bg-prep-tint text-prep' },
  ACCEPTED: { label: 'Cooking', tone: 'bg-prep-tint text-prep' },
  PREPARING: { label: 'Cooking', tone: 'bg-prep-tint text-prep' },
  READY: { label: 'Ready', tone: 'bg-ready-tint text-ready' },
  COLLECTED: { label: 'Collected', tone: 'bg-ready-tint text-ready' },
  REJECTED: { label: 'Rejected · refunded', tone: 'bg-surface-2 text-ink-3' },
  TIMED_OUT: { label: 'Timed out · refunded', tone: 'bg-surface-2 text-ink-3' },
  CANCELLED: { label: 'Cancelled · refunded', tone: 'bg-surface-2 text-ink-3' },
};
const FAILED = new Set(['REJECTED', 'TIMED_OUT', 'CANCELLED']);

/** Rate as a shop reads it, e.g. "10% + ₹2 per order". */
export const rateText = (s: Pick<ShopFigures, 'feePct' | 'perOrderFeePaise'>) =>
  [s.feePct ? `${s.feePct}%` : '', s.perOrderFeePaise ? `${formatPaise(s.perOrderFeePaise)} per order` : ''].filter(Boolean).join(' + ') || 'no commission';

/**
 * One shop's money, for that shop's own finance login: what it sold, what the court kept,
 * what it has been paid and what the court still owes it. Nothing about any other shop.
 */
export function ShopFinance({ vendorId, range, onLoaded }: { vendorId: string; range: Range; onLoaded?: (s: ShopFigures) => void }) {
  const [figures, setFigures] = useState<ShopFigures | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [tickets, setTickets] = useState<SubOrder[] | null>(null);
  const [cursor, setCursor] = useState<TicketPage['cursor']>(null);
  const [more, setMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    setTickets(null);
    Promise.all([getShopReport(range.from, range.to, vendorId), listShopPayouts(vendorId), listShopTickets(vendorId, range.from, range.to)])
      .then(([f, p, t]) => {
        if (!live) return;
        setFigures(f);
        onLoaded?.(f);
        setPayouts(p);
        setTickets(t.rows);
        setCursor(t.cursor);
      })
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [vendorId, range.from, range.to, tick, onLoaded]);

  const loadMore = async () => {
    if (!cursor) return;
    setMore(true);
    try {
      const p = await listShopTickets(vendorId, range.from, range.to, cursor);
      setTickets((t) => [...(t ?? []), ...p.rows]);
      setCursor(p.cursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMore(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    await run(
      allShopTickets(vendorId, range.from, range.to).then((list) =>
        downloadCsv(
          `${figures?.code || 'shop'}-orders-${range.from}_to_${range.to}.csv`,
          ['Placed at', 'Token', 'Table', 'Items', 'Paid', 'Amount (Rs)', 'Court commission (Rs)', 'Your share (Rs)', 'Status', 'Refund (Rs)'],
          list.map((t) => {
            const failed = FAILED.has(t.status);
            const commission = failed ? 0 : t.commissionPaise ?? 0;
            return [
              formatTime(t.ts.placed),
              t.token,
              t.tableLabel,
              t.items.map((i) => `${i.qty} x ${i.name}`).join('; '),
              t.paymentMode === 'COUNTER' ? 'At counter' : 'Online',
              rupees(t.subtotalPaise),
              rupees(commission),
              rupees(failed ? 0 : t.paymentMode === 'COUNTER' ? -commission : t.subtotalPaise - commission),
              TICKET[t.status]?.label ?? t.status,
              t.refund && t.refund.status !== 'NOT_REQUIRED' ? rupees(t.refund.amountPaise) : '',
            ];
          })
        )
      )
    );
    setExporting(false);
  };

  if (!figures) return error ? <LoadError text={error} onRetry={reload} /> : <ShopSkeleton />;
  const f = figures;
  const received = (payouts ?? []).filter((p) => p.paidOn >= range.from && p.paidOn <= range.to);

  return (
    <div className={cx('transition-opacity duration-200', loading && 'opacity-60')} aria-busy={loading}>
      {error && <LoadError text={error} onRetry={reload} compact />}
      <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          feature
          className="md:col-span-2 xl:row-span-2"
          label="Your earnings"
          value={money(f.payablePaise)}
          icon={Wallet}
          tone="accent"
          hint={`${f.orders} online ${f.orders === 1 ? 'order' : 'orders'} in this period`}
        >
          <dl className="grid grid-cols-2 gap-3 border-t border-accent-line/70 pt-4 text-sm">
            <div>
              <dt className="text-ink-3">Food sold online</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{money(f.salesPaise)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Court commission ({rateText(f)})</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">− {money(f.commissionPaise)}</dd>
            </div>
          </dl>
        </KpiTile>
        <KpiTile label="Due from the court" value={money(Math.max(0, f.balanceDuePaise))} icon={Landmark} tone={f.balanceDuePaise > 0 ? 'prep' : 'neutral'} hint="All time, after every payment received" />
        <KpiTile label="Paid to you" value={money(f.paidOutPaise)} icon={ArrowDownLeft} tone="ready" hint="Payments dated in this period" />
        <KpiTile label="Refunded to diners" value={money(f.refundsPaise)} icon={RotateCcw} tone="neutral" hint="Rejected, cancelled or timed-out orders" />
        <KpiTile label="Paid at your counter" value={money(f.counterSalesPaise)} icon={Banknote} tone="neutral" hint={`${f.counterOrders} ${f.counterOrders === 1 ? 'order' : 'orders'} · you already hold this cash`} />
      </dl>

      <section aria-labelledby="received-title" className="mt-8 overflow-hidden rounded-sheet bg-surface shadow-card ring-1 ring-inset ring-line/70">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id="received-title" className="text-lg font-semibold tracking-tight text-ink">
              Payments from the court
            </h2>
            <p className="text-sm text-ink-3">Every transfer the court has recorded to your shop in this period, with its bank reference.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={reload} icon={<RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />}>
            Refresh
          </Button>
        </div>
        {received.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-3">No payments recorded in this period.</p>
        ) : (
          <ul className="divide-y divide-line/80">
            {received.map((p) => {
              const off = p.status === 'VOID';
              return (
                <li key={p.id} className={cx('flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3.5 text-sm', off && 'text-ink-3')}>
                  <span className="w-28 tabular-nums">{formatDay(p.paidOn)}</span>
                  <span className={cx('w-28 font-semibold tabular-nums', off ? 'line-through' : 'text-ink')}>{formatPaise(p.amountPaise, true)}</span>
                  <span className="font-mono text-[13px] text-ink-2">UTR {p.reference}</span>
                  <span className="min-w-0 flex-1 truncate">{off ? <span className="font-medium text-danger">Cancelled by the court · {p.voidReason}</span> : p.note}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="orders-title" className="mt-6 overflow-hidden rounded-sheet bg-surface shadow-card ring-1 ring-inset ring-line/70">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id="orders-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
              <ReceiptText className="h-5 w-5 text-ink-3" /> Orders
            </h2>
            <p className="text-sm text-ink-3">Each order, the court's commission on it and your share.</p>
          </div>
          <Button variant="outline" size="sm" loading={exporting} disabled={!tickets?.length} onClick={() => void exportCsv()} icon={<Download className="h-4 w-4" />}>
            Export CSV
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-bg/60 text-xs text-ink-3">
              <tr>
                <th className="py-3 pl-5 pr-3 font-medium">Placed</th>
                <th className="px-3 py-3 font-medium">Token</th>
                <th className="px-3 py-3 font-medium">Items</th>
                <th className="px-3 py-3 font-medium">Paid</th>
                <th className="px-3 py-3 text-right font-medium">Amount</th>
                <th className="px-3 py-3 text-right font-medium">Commission</th>
                <th className="py-3 pl-3 pr-5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/80">
              {tickets === null ? (
                Array.from({ length: 5 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-5 py-3">
                      <Skeleton className="h-6" />
                    </td>
                  </tr>
                ))
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14">
                    <div className="flex flex-col items-center text-center">
                      <span className="grid h-14 w-14 place-items-center rounded-[18px] bg-accent-tint text-accent-ink ring-1 ring-inset ring-accent-line">
                        <Inbox className="h-6 w-6" strokeWidth={1.75} />
                      </span>
                      <p className="mt-4 text-base font-semibold text-ink">No orders in this period</p>
                      <p className="mt-1 max-w-sm text-sm text-ink-3">Pick another period above. Every order a diner pays for shows up here.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                tickets.map((t) => {
                  const failed = FAILED.has(t.status);
                  const s = TICKET[t.status] ?? { label: t.status, tone: 'bg-surface-2 text-ink-2' };
                  return (
                    <tr key={t.id} className={cx('transition-colors duration-150 hover:bg-accent-tint/40', failed && 'text-ink-3')}>
                      <td className="py-3.5 pl-5 pr-3 tabular-nums">{formatTime(t.ts.placed)}</td>
                      <td className="px-3 py-3.5 font-mono text-[13px] font-semibold text-ink">{t.token}</td>
                      <td className="max-w-[300px] truncate px-3 py-3.5 text-ink-2">{t.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</td>
                      <td className="px-3 py-3.5 text-ink-2">{t.paymentMode === 'COUNTER' ? 'At counter' : 'Online'}</td>
                      <td className={cx('px-3 py-3.5 text-right font-semibold tabular-nums', failed ? 'line-through' : 'text-ink')}>{formatPaise(t.subtotalPaise, true)}</td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-ink-2">{failed ? '—' : formatPaise(t.commissionPaise ?? 0, true)}</td>
                      <td className="py-3.5 pl-3 pr-5">
                        <span className={cx('inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold', s.tone)}>{s.label}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {cursor && (
          <div className="border-t border-line px-5 py-3 text-center">
            <Button variant="ghost" size="sm" loading={more} onClick={() => void loadMore()}>
              Show more
            </Button>
          </div>
        )}
      </section>

      <p className="mt-4 text-xs text-ink-3">
        Your earnings are online sales minus the court's commission ({rateText(f)}). Commission on counter orders is also taken from what the court pays you, because
        you already hold that cash. Questions about a payment? Ask the court manager with the UTR.
      </p>
    </div>
  );
}

function ShopSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your figures">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-[260px] rounded-sheet md:col-span-2 xl:row-span-2" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[122px] rounded-sheet" />
        ))}
      </div>
      <Skeleton className="mt-8 h-40 rounded-sheet" />
    </div>
  );
}
