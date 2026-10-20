import { useState, type ReactNode } from 'react';
import { Banknote, Download, HandCoins, IndianRupee, Percent, RefreshCw, RotateCcw, ShoppingBag, Wallet } from 'lucide-react';
import { formatPaise, type ShopFinance } from '@foodcourt/shared';
import { Button, Monogram, Skeleton, cx } from '@foodcourt/ui';
import type { PageProps } from '../types';
import { KpiTile } from '../components/KpiTile';
import { PayoutSheet } from '../components/PayoutSheet';
import { downloadCsv, rupees } from '../lib/csv';
import { CommissionSheet } from './CommissionSheet';
import { LoadError } from '../components/LoadError';
import { Delta } from '../components/Delta';
import { Segmented } from '../components/Segmented';
import { ShopCompare } from '../components/ShopCompare';
import { TrendChart } from '../components/TrendChart';
import { bucketTitle, compactRupees, money } from '../lib/format';
import { compareLabel } from '../lib/range';

type Trend = 'commission' | 'sales' | 'orders';
const TREND: Array<{ key: Trend; label: string }> = [
  { key: 'commission', label: 'Court income' },
  { key: 'sales', label: 'Sales' },
  { key: 'orders', label: 'Orders' },
];
const rate = (s: ShopFinance) => [s.feePct ? `${s.feePct}%` : '', s.perOrderFeePaise ? `${formatPaise(s.perOrderFeePaise)}/order` : ''].filter(Boolean).join(' + ') || 'No commission';

export function Overview({ range, report: { report, loading, error, reload } }: PageProps) {
  const [paying, setPaying] = useState<string | null>(null);
  const [editing, setEditing] = useState<ShopFinance | null>(null);
  const [trend, setTrend] = useState<Trend>('commission');

  if (!report) {
    return error ? <LoadError text={error} onRetry={reload} /> : <OverviewSkeleton />;
  }

  const r = report;
  const cmp = compareLabel(range);
  const points = r.series.map((p) => ({ key: p.key, value: trend === 'sales' ? p.salesPaise : trend === 'orders' ? p.orders : p.commissionPaise }));
  const peak = points.reduce<(typeof points)[number] | null>((best, p) => (!best || p.value > best.value ? p : best), null);
  const trendFormat = (v: number) => (trend === 'orders' ? `${v.toLocaleString('en-IN')} ${v === 1 ? 'order' : 'orders'}` : formatPaise(v, true));
  const owing = r.shops.filter((s) => s.balanceDuePaise > 0).sort((a, b) => b.balanceDuePaise - a.balanceDuePaise);
  const exportShops = () =>
    downloadCsv(
      `reva-shops-${range.from}_to_${range.to}.csv`,
      ['Shop', 'Code', 'Online orders', 'Sales (Rs)', 'Refunds (Rs)', 'Commission (Rs)', 'Payable for period (Rs)', 'Paid out in period (Rs)', 'Balance due (Rs)', 'Counter orders', 'Counter sales (Rs)', 'Commission rate'],
      r.shops.map((s) => [s.name, s.code, s.orders, rupees(s.salesPaise), rupees(s.refundsPaise), rupees(s.commissionPaise), rupees(s.payablePaise), rupees(s.paidOutPaise), rupees(s.balanceDuePaise), s.counterOrders, rupees(s.counterSalesPaise), rate(s)])
    );

  return (
    <div className={cx('transition-opacity duration-200', loading && 'opacity-60')} aria-busy={loading}>
      {error && <LoadError text={error} onRetry={reload} compact />}
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile feature label="Court income" value={money(r.commissionPaise)} icon={Percent} tone="accent" hint={<Delta now={r.commissionPaise} before={r.previous.commissionPaise} label={cmp} />} />
        <KpiTile label="Collected online" value={money(r.collectedPaise)} icon={IndianRupee} tone="ready" hint={<Delta now={r.collectedPaise} before={r.previous.collectedPaise} label={cmp} />} />
        <KpiTile label="Paid orders" value={r.paidOrders.toLocaleString('en-IN')} icon={ShoppingBag} tone="prep" hint={<Delta now={r.paidOrders} before={r.previous.paidOrders} label={cmp} />} />
        <KpiTile label="Refunded to diners" value={money(r.refundsPaise)} icon={RotateCcw} tone="neutral" hint={<Delta now={r.refundsPaise} before={r.previous.refundsPaise} label={cmp} goodWhenDown />} />
      </dl>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section aria-labelledby="trend-title" className="rounded-sheet bg-surface p-5 shadow-card ring-1 ring-inset ring-line/70 xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="trend-title" className="text-lg font-semibold tracking-tight text-ink">
                {TREND.find((t) => t.key === trend)!.label} by {r.granularity}
              </h2>
              <p className="text-sm text-ink-3">
                {peak && peak.value > 0 ? (
                  <>
                    Busiest {r.granularity === 'hour' ? 'hour' : r.granularity === 'day' ? 'day' : 'week'}: <span className="font-medium text-ink-2">{bucketTitle(peak.key, r.granularity)}</span> ·{' '}
                    {trendFormat(peak.value)}
                  </>
                ) : (
                  'Each bar is one ' + r.granularity + '. Hover a bar for its figure.'
                )}
              </p>
            </div>
            <Segmented label="Chart shows" value={trend} options={TREND} onChange={setTrend} />
          </div>
          <div className="mt-4">
            <TrendChart points={points} granularity={r.granularity} format={trendFormat} axis={trend === 'orders' ? (v) => String(v) : compactRupees} label={`${TREND.find((t) => t.key === trend)!.label} by ${r.granularity}`} />
          </div>
        </section>

        <section aria-labelledby="owed-title" className="flex flex-col rounded-sheet bg-surface p-5 shadow-card ring-1 ring-inset ring-line/70">
          <p className="flex items-center gap-2 text-sm font-medium text-ink-2">
            <Wallet className="h-4 w-4 text-prep" />
            <span id="owed-title">Still owed to shops</span>
          </p>
          <p className={cx('mt-3 text-[34px] font-semibold leading-none tracking-tight tabular-nums', r.balanceDuePaise > 0 ? 'text-ink' : 'text-ink-3')}>{money(Math.max(0, r.balanceDuePaise))}</p>
          <p className="mt-1.5 text-sm text-ink-3">All time, after every payout recorded.</p>
          <ul className="mt-4 divide-y divide-line/80 border-y border-line/80">
            {owing.length === 0 ? (
              <li className="py-3 text-sm text-ink-3">Every shop is paid up.</li>
            ) : (
              owing.slice(0, 5).map((s) => (
                <li key={s.vendorId} className="flex items-center gap-3 py-2.5">
                  <Monogram code={s.code || s.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{s.name}</span>
                  <span className="text-sm font-semibold tabular-nums text-ink">{money(s.balanceDuePaise)}</span>
                  <Button variant="tint" size="sm" onClick={() => setPaying(s.vendorId)}>
                    Pay
                  </Button>
                </li>
              ))
            )}
          </ul>
          <dl className="mt-auto grid grid-cols-2 gap-3 pt-4 text-sm">
            <div>
              <dt className="text-ink-3">Shops earned</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-ink">{money(r.payablePaise)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Paid this period</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-ink">{money(r.paidOutPaise)}</dd>
            </div>
          </dl>
        </section>
      </div>

      {r.counterOrders > 0 && (
        <p className="mt-4 flex items-start gap-2.5 rounded-card bg-surface px-4 py-3 text-sm text-ink-2 ring-1 ring-inset ring-line">
          <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-prep" />
          <span>
            {r.counterOrders} {r.counterOrders === 1 ? 'order was' : 'orders were'} paid at shop counters ({money(r.counterSalesPaise)}). Shops already hold that cash, so the
            court's commission on it is taken off their payout.
          </span>
        </p>
      )}

      <div className="mt-4">
        <ShopCompare shops={r.shops} compare={cmp} />
      </div>

      <section aria-labelledby="shops-title" className="mt-4 overflow-hidden rounded-sheet bg-surface shadow-card ring-1 ring-inset ring-line/70">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id="shops-title" className="text-lg font-semibold tracking-tight text-ink">
              Shops
            </h2>
            <p className="text-sm text-ink-3">What each shop earned, what the court keeps, and what is still to be paid.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={reload} icon={<RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />}>
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportShops} disabled={r.shops.length === 0} icon={<Download className="h-4 w-4" />}>
              Export CSV
            </Button>
          </div>
        </div>
        {r.shops.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-ink-3">No shops are set up yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="bg-bg/60 text-xs text-ink-3">
                <tr>
                  <th className="py-3 pl-5 pr-3 font-medium">Shop</th>
                  <Th>Orders</Th>
                  <Th>Sales</Th>
                  <Th>Refunds</Th>
                  <Th>Commission</Th>
                  <Th>Shop's share</Th>
                  <Th>Paid out</Th>
                  <Th>Balance due</Th>
                  <th className="py-3 pl-3 pr-5" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/80">
                {r.shops.map((s) => (
                  <tr key={s.vendorId} className="transition-colors duration-150 hover:bg-accent-tint/40">
                    <td className="py-3.5 pl-5 pr-3">
                      <div className="flex items-center gap-3">
                        <Monogram code={s.code || s.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{s.name}</p>
                          <button type="button" onClick={() => setEditing(s)} className="text-xs text-ink-3 underline decoration-line-strong underline-offset-2 hover:text-accent-ink">
                            {rate(s)}
                          </button>
                        </div>
                      </div>
                    </td>
                    <Td>{s.orders}</Td>
                    <Td>{money(s.salesPaise)}</Td>
                    <Td muted={s.refundsPaise === 0}>{money(s.refundsPaise)}</Td>
                    <Td muted={s.commissionPaise === 0}>{money(s.commissionPaise)}</Td>
                    <Td strong>{money(s.payablePaise)}</Td>
                    <Td muted={s.paidOutPaise === 0}>{money(s.paidOutPaise)}</Td>
                    <td className="px-3 py-3.5 text-right">
                      <span
                        className={cx(
                          'inline-flex h-7 items-center rounded-full px-2.5 font-semibold tabular-nums',
                          s.balanceDuePaise > 0 ? 'bg-prep-tint text-prep' : s.balanceDuePaise < 0 ? 'bg-surface-2 text-ink-2' : 'text-ink-3'
                        )}
                        title={s.balanceDuePaise < 0 ? 'Paid in advance' : undefined}
                      >
                        {s.balanceDuePaise < 0 ? `${money(-s.balanceDuePaise)} ahead` : money(s.balanceDuePaise)}
                      </span>
                    </td>
                    <td className="py-2 pl-3 pr-5 text-right">
                      <Button variant="tint" size="sm" onClick={() => setPaying(s.vendorId)} icon={<HandCoins className="h-4 w-4" />}>
                        Pay
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line bg-bg/60 font-semibold text-ink">
                <tr>
                  <td className="py-3.5 pl-5 pr-3">All shops</td>
                  <Td>{r.shops.reduce((n, s) => n + s.orders, 0)}</Td>
                  <Td>{money(r.shops.reduce((n, s) => n + s.salesPaise, 0))}</Td>
                  <Td>{money(r.refundsPaise)}</Td>
                  <Td>{money(r.commissionPaise)}</Td>
                  <Td>{money(r.payablePaise)}</Td>
                  <Td>{money(r.paidOutPaise)}</Td>
                  <Td>{money(r.balanceDuePaise)}</Td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <p className="mt-4 flex items-start gap-2 text-xs text-ink-3">
        <RotateCcw className="mt-px h-3.5 w-3.5 shrink-0" />
        Sales leave out rejected, cancelled and timed-out tickets; those diners were refunded. Gateway fees are charged by Cashfree on its settlements and are not
        included here.
      </p>

      <PayoutSheet open={paying !== null} shops={r.shops} vendorId={paying ?? undefined} onClose={() => setPaying(null)} onSaved={reload} />
      <CommissionSheet shop={editing} onClose={() => setEditing(null)} onSaved={reload} />
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="px-3 py-3 text-right font-medium">{children}</th>;
}

function Td({ children, muted, strong }: { children: ReactNode; muted?: boolean; strong?: boolean }) {
  return <td className={cx('px-3 py-3.5 text-right tabular-nums', muted ? 'text-ink-3' : strong ? 'font-semibold text-ink' : 'text-ink-2')}>{children}</td>;
}

function OverviewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading figures">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[132px] rounded-sheet" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-[340px] rounded-sheet xl:col-span-2" />
        <Skeleton className="h-[340px] rounded-sheet" />
      </div>
      <Skeleton className="mt-4 h-56 rounded-sheet" />
    </div>
  );
}
