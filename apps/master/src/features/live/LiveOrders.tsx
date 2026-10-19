import { useDeferredValue, useMemo, useState } from 'react';
import { ChefHat, Clock3, Inbox, IndianRupee, PackageCheck, Search, Timer } from 'lucide-react';
import { cancelSubOrder } from '@foodcourt/firebase-client/local-ops';
import { canTransitionSubOrder, formatPaise, todayStats, type SubOrder, type SubOrderStatus } from '@foodcourt/shared';
import { Button, Monogram, cx, useNow } from '@foodcourt/ui';
import { Sparkline } from '../../components/Charts';
import { KpiTile } from '../../components/KpiTile';
import { StatusPill } from '../../components/StatusPill';
import { hourlyToday } from '../../lib/hourly';
import { jsonEqual, useLocal } from '../../lib/store';
import { CancelSheet } from './CancelSheet';

type Filter = 'active' | 'new' | 'cooking' | 'ready' | 'collected' | 'problems' | 'all';

const ACTIVE = (s: SubOrderStatus) => s === 'NEW' || s === 'ACCEPTED' || s === 'PREPARING' || s === 'READY';

const FILTERS: Array<{ key: Filter; label: string; match: (s: SubOrderStatus) => boolean }> = [
  { key: 'active', label: 'Active', match: ACTIVE },
  { key: 'new', label: 'New', match: (s) => s === 'NEW' },
  { key: 'cooking', label: 'Cooking', match: (s) => s === 'ACCEPTED' || s === 'PREPARING' },
  { key: 'ready', label: 'Ready', match: (s) => s === 'READY' },
  { key: 'collected', label: 'Collected', match: (s) => s === 'COLLECTED' },
  { key: 'problems', label: 'Problems', match: (s) => s === 'REJECTED' || s === 'TIMED_OUT' || s === 'CANCELLED' },
  { key: 'all', label: 'All', match: () => true },
];

// Same 2 / 5 / 10 minute escalation the kitchens see (PRD FR-V1).
function ageTone(minutes: number, active: boolean): string {
  if (!active) return 'bg-surface-2 text-ink-3';
  if (minutes >= 10) return 'bg-danger text-on-accent';
  if (minutes >= 5) return 'bg-prep text-on-accent';
  if (minutes >= 2) return 'bg-prep-tint text-prep';
  return 'bg-surface-2 text-ink-2';
}

export function LiveOrders() {
  const subs = useLocal((s) => Object.values(s.subOrders).sort((a, b) => b.ts.placed - a.ts.placed), jsonEqual);
  const vendors = useLocal((s) => s.vendors, jsonEqual);
  const now = useNow(15_000);
  const [shop, setShop] = useState('ALL');
  const [filter, setFilter] = useState<Filter>('active');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [cancelling, setCancelling] = useState<SubOrder | null>(null);

  const stats = todayStats(subs, now);
  let running = 0;
  const salesCurve = hourlyToday(subs, now).map((h) => (running += h.salesPaise));
  const inShop = subs.filter((s) => shop === 'ALL' || s.vendorId === shop);
  const waiting = subs.filter((s) => s.status === 'NEW' && now - s.ts.placed > 2 * 60_000);
  const cooking = subs.filter((s) => s.status === 'ACCEPTED' || s.status === 'PREPARING');
  const ready = subs.filter((s) => s.status === 'READY');
  const codeOf = useMemo(() => Object.fromEntries(vendors.map((v) => [v.id, v.code])), [vendors]);

  const rows = useMemo(() => {
    const match = FILTERS.find((f) => f.key === filter)!.match;
    const q = deferredQuery.trim().toLowerCase();
    return inShop.filter(
      (s) =>
        match(s.status) &&
        (!q || s.token.toLowerCase().includes(q) || s.tableLabel.toLowerCase().includes(q) || s.customerDisplay.toLowerCase().includes(q))
    );
  }, [inShop, filter, deferredQuery]);

  return (
    <>
      <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          feature
          className="md:col-span-2 xl:row-span-2"
          label="Collected sales today"
          value={formatPaise(stats.salesPaise)}
          icon={IndianRupee}
          tone="accent"
          hint={`${stats.collected} orders collected across ${vendors.length} shops`}
        >
          <Sparkline values={salesCurve} label="Collected sales through the day" />
        </KpiTile>
        <KpiTile
          label="Waiting over 2 min"
          value={String(waiting.length)}
          icon={Clock3}
          tone={waiting.length > 0 ? 'danger' : 'neutral'}
          alert={waiting.length > 0}
          hint={waiting.length > 0 ? 'A kitchen may need a nudge.' : 'Every new order is moving.'}
        />
        <KpiTile label="Cooking now" value={String(cooking.length)} icon={ChefHat} tone="prep" hint="Accepted and on the stove" />
        <KpiTile label="Ready at counters" value={String(ready.length)} icon={PackageCheck} tone="ready" hint="Waiting for diners to collect" />
        <KpiTile
          label="Accept to ready"
          value={stats.medianReadyMin === null ? 'No data yet' : `${Math.round(stats.medianReadyMin)} min`}
          muted={stats.medianReadyMin === null}
          icon={Timer}
          tone="accent"
          hint="Median across shops today"
        />
      </dl>

      <section aria-label="Orders" className="mt-8 overflow-hidden rounded-sheet bg-surface shadow-card ring-1 ring-inset ring-line/70">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4" data-print="hide">
          <div role="tablist" aria-label="Shop" className="flex rounded-full bg-surface-2 p-1">
            {[{ id: 'ALL', name: 'All shops' }, ...vendors].map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={shop === v.id}
                onClick={() => setShop(v.id)}
                className={cx(
                  'h-9 rounded-full px-4 text-sm font-medium transition-[background-color,color,box-shadow] duration-200',
                  shop === v.id ? 'bg-surface text-ink shadow-thumb' : 'text-ink-3 hover:text-ink'
                )}
              >
                {v.name}
              </button>
            ))}
          </div>
          <label className="relative ml-auto w-full sm:w-72">
            <span className="sr-only">Search orders</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" strokeWidth={2} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Token, table or diner"
              className="h-10 w-full rounded-full bg-surface-2 pl-10 pr-4 text-sm text-ink outline-none transition-[background-color,box-shadow] placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-accent/40"
            />
          </label>
          <div role="tablist" aria-label="Status" className="no-scrollbar -mx-1 flex w-full gap-1 overflow-x-auto px-1">
            {FILTERS.map((f) => {
              const count = inShop.filter((s) => f.match(s.status)).length;
              const selected = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setFilter(f.key)}
                  className={cx(
                    'inline-flex h-9 shrink-0 items-center gap-2 rounded-full pl-3.5 pr-2 text-sm font-medium transition-colors duration-150',
                    selected ? 'bg-accent-tint text-accent-ink ring-1 ring-inset ring-accent-line' : 'text-ink-2 hover:bg-surface-2'
                  )}
                >
                  {f.label}
                  <span
                    className={cx(
                      'grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-2xs font-semibold tabular-nums',
                      selected ? 'bg-accent-ink text-on-accent' : 'bg-surface-2 text-ink-3'
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-bg/60 text-xs text-ink-3">
              <tr>
                <th className="py-3 pl-5 pr-3 font-medium">Order</th>
                <th className="px-3 py-3 font-medium">Table</th>
                <th className="px-3 py-3 font-medium">Diner</th>
                <th className="px-3 py-3 font-medium">Items</th>
                <th className="px-3 py-3 text-right font-medium">Amount</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Waiting</th>
                <th className="py-3 pl-3 pr-5" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/80">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16">
                    <div className="flex flex-col items-center text-center">
                      <span className="grid h-14 w-14 place-items-center rounded-[18px] bg-accent-tint text-accent-ink ring-1 ring-inset ring-accent-line">
                        <Inbox className="h-6 w-6" strokeWidth={1.75} />
                      </span>
                      <p className="mt-4 text-base font-semibold text-ink">{subs.length === 0 ? 'No orders yet today' : 'Nothing matches these filters'}</p>
                      <p className="mt-1 max-w-sm text-sm text-ink-3">
                        {subs.length === 0
                          ? 'Tickets show up here the moment a diner pays at any table.'
                          : 'Try another shop or status, or clear the search.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((s) => {
                  const minutes = Math.max(0, Math.floor((now - s.ts.placed) / 60_000));
                  return (
                    <tr key={s.id} className="group transition-colors duration-150 hover:bg-accent-tint/40">
                      <td className="py-3.5 pl-5 pr-3">
                        <div className="flex items-center gap-3">
                          <Monogram code={codeOf[s.vendorId] ?? s.token} size="sm" />
                          <div className="min-w-0">
                            <p className="font-mono text-[15px] font-semibold text-ink">{s.token}</p>
                            <p className="truncate text-xs text-ink-3">{s.vendorName}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="inline-flex h-7 items-center rounded-[8px] bg-surface-2 px-2.5 font-mono text-xs font-semibold text-ink-2">
                          {s.tableLabel}
                        </span>
                      </td>
                      <td className="max-w-[170px] truncate px-3 py-3.5 text-ink-2">{s.customerDisplay}</td>
                      <td className="max-w-[300px] truncate px-3 py-3.5 text-ink-2">{s.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</td>
                      <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-ink">{formatPaise(s.subtotalPaise)}</td>
                      <td className="px-3 py-3.5">
                        <StatusPill status={s.status} />
                      </td>
                      <td className="px-3 py-3.5">
                        <span
                          className={cx(
                            'inline-flex h-7 min-w-12 items-center justify-center rounded-full px-2.5 font-mono text-xs font-semibold tabular-nums',
                            ageTone(minutes, ACTIVE(s.status))
                          )}
                        >
                          {minutes}m
                        </span>
                      </td>
                      <td className="py-2 pl-3 pr-5 text-right">
                        {canTransitionSubOrder(s.status, 'CANCELLED') && (
                          <Button variant="danger" size="sm" onClick={() => setCancelling(s)}>
                            Cancel
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <CancelSheet
        sub={cancelling}
        onClose={() => setCancelling(null)}
        onConfirm={(sub, reason) => {
          cancelSubOrder(sub.id, reason);
          setCancelling(null);
        }}
      />
    </>
  );
}
