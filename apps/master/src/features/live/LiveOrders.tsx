import { useDeferredValue, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { cancelSubOrder } from '@foodcourt/firebase-client/local-ops';
import { canTransitionSubOrder, formatPaise, todayStats, type SubOrder, type SubOrderStatus } from '@foodcourt/shared';
import { Button, cx, useNow } from '@foodcourt/ui';
import { Stat } from '../../components/Stat';
import { StatusPill } from '../../components/StatusPill';
import { jsonEqual, useLocal } from '../../lib/store';
import { CancelSheet } from './CancelSheet';

type Filter = 'active' | 'new' | 'cooking' | 'ready' | 'collected' | 'problems' | 'all';

const FILTERS: Array<{ key: Filter; label: string; match: (s: SubOrderStatus) => boolean }> = [
  { key: 'active', label: 'Active', match: (s) => s === 'NEW' || s === 'ACCEPTED' || s === 'PREPARING' || s === 'READY' },
  { key: 'new', label: 'New', match: (s) => s === 'NEW' },
  { key: 'cooking', label: 'Cooking', match: (s) => s === 'ACCEPTED' || s === 'PREPARING' },
  { key: 'ready', label: 'Ready', match: (s) => s === 'READY' },
  { key: 'collected', label: 'Collected', match: (s) => s === 'COLLECTED' },
  { key: 'problems', label: 'Problems', match: (s) => s === 'REJECTED' || s === 'TIMED_OUT' || s === 'CANCELLED' },
  { key: 'all', label: 'All', match: () => true },
];

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
  const active = subs.filter((s) => FILTERS[0]!.match(s.status));
  const waiting = subs.filter((s) => s.status === 'NEW' && now - s.ts.placed > 2 * 60_000);

  const rows = useMemo(() => {
    const match = FILTERS.find((f) => f.key === filter)!.match;
    const q = deferredQuery.trim().toLowerCase();
    return subs.filter(
      (s) =>
        (shop === 'ALL' || s.vendorId === shop) &&
        match(s.status) &&
        (!q ||
          s.token.toLowerCase().includes(q) ||
          s.tableLabel.toLowerCase().includes(q) ||
          s.customerDisplay.toLowerCase().includes(q))
    );
  }, [subs, shop, filter, deferredQuery]);

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Active tickets" value={String(active.length)} />
        <Stat
          label="New for over 2 min"
          value={String(waiting.length)}
          tone={waiting.length > 0 ? 'warn' : 'default'}
          hint={waiting.length > 0 ? 'A shop may need a nudge.' : undefined}
        />
        <Stat label="Ready at counters" value={String(subs.filter((s) => s.status === 'READY').length)} />
        <Stat label="Collected sales today" value={formatPaise(stats.salesPaise)} />
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-3" data-print="hide">
        <div role="tablist" aria-label="Shop" className="flex rounded-full bg-surface-2 p-1">
          {[{ id: 'ALL', name: 'All shops' }, ...vendors].map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={shop === v.id}
              onClick={() => setShop(v.id)}
              className={cx(
                'h-9 rounded-full px-4 text-sm font-medium transition-colors',
                shop === v.id ? 'bg-surface text-ink shadow-thumb' : 'text-ink-3 hover:text-ink'
              )}
            >
              {v.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Status">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cx(
                'h-9 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset transition-colors',
                filter === f.key ? 'bg-ink text-surface ring-ink' : 'bg-surface text-ink-2 ring-line hover:bg-surface-2'
              )}
            >
              {f.label}
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
            className="h-10 w-full rounded-full bg-surface pl-10 pr-4 text-sm text-ink outline-none ring-1 ring-inset ring-line placeholder:text-ink-3 focus:ring-2 focus:ring-accent/50"
          />
        </label>
      </div>

      <div className="mt-4 overflow-x-auto rounded-card bg-surface ring-1 ring-inset ring-line">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-line text-xs font-medium text-ink-3">
            <tr>
              <th className="px-4 py-3 font-medium">Token</th>
              <th className="px-4 py-3 font-medium">Shop</th>
              <th className="px-4 py-3 font-medium">Table</th>
              <th className="px-4 py-3 font-medium">Diner</th>
              <th className="px-4 py-3 font-medium">Items</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Age</th>
              <th className="px-4 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-14 text-center text-ink-3">
                  {subs.length === 0 ? 'No orders yet today.' : 'No orders match these filters.'}
                </td>
              </tr>
            ) : (
              rows.map((s) => {
                const minutes = Math.max(0, Math.floor((now - s.ts.placed) / 60_000));
                return (
                  <tr key={s.id} className="transition-colors hover:bg-bg">
                    <td className="px-4 py-3 font-mono font-semibold text-ink">{s.token}</td>
                    <td className="px-4 py-3 text-ink-2">{s.vendorName}</td>
                    <td className="px-4 py-3 text-ink-2">{s.tableLabel}</td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-ink-2">{s.customerDisplay}</td>
                    <td className="max-w-[280px] truncate px-4 py-3 text-ink-2">
                      {s.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-ink">{formatPaise(s.subtotalPaise)}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={s.status} />
                    </td>
                    <td className={cx('px-4 py-3 text-right font-mono tabular-nums', minutes >= 10 && FILTERS[0]!.match(s.status) ? 'font-semibold text-danger' : 'text-ink-3')}>
                      {minutes}m
                    </td>
                    <td className="px-2 py-1.5 text-right">
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
