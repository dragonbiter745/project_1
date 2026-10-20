import { useState } from 'react';
import type { ShopFinance } from '@foodcourt/shared';
import { Monogram } from '@foodcourt/ui';
import { money } from '../lib/format';
import { Delta } from './Delta';
import { Segmented } from './Segmented';

type Metric = 'sales' | 'commission' | 'orders';

const METRICS: Array<{ key: Metric; label: string }> = [
  { key: 'sales', label: 'Sales' },
  { key: 'commission', label: 'Court income' },
  { key: 'orders', label: 'Orders' },
];

const valueOf = (s: ShopFinance, m: Metric) => (m === 'sales' ? s.salesPaise : m === 'commission' ? s.commissionPaise : s.orders);
const beforeOf = (s: ShopFinance, m: Metric) => (m === 'sales' ? s.previousSalesPaise : m === 'orders' ? s.previousOrders : undefined);

/** Shops side by side: one bar each, its share of the court, and how it moved since the last period. */
export function ShopCompare({ shops, compare }: { shops: ShopFinance[]; compare: string }) {
  const [metric, setMetric] = useState<Metric>('sales');
  const rows = [...shops].sort((a, b) => valueOf(b, metric) - valueOf(a, metric));
  const max = Math.max(1, ...rows.map((s) => valueOf(s, metric)));
  const total = rows.reduce((n, s) => n + valueOf(s, metric), 0);
  const show = (v: number) => (metric === 'orders' ? v.toLocaleString('en-IN') : money(v));

  return (
    <section aria-labelledby="compare-title" className="rounded-sheet bg-surface p-5 shadow-card ring-1 ring-inset ring-line/70">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="compare-title" className="text-lg font-semibold tracking-tight text-ink">
            Shops compared
          </h2>
          <p className="text-sm text-ink-3">Who sold the most, and each shop's share of the court.</p>
        </div>
        <Segmented label="Compare by" value={metric} options={METRICS} onChange={setMetric} />
      </div>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-3">No shops are set up yet.</p>
      ) : (
        <ul className="mt-5 space-y-4">
          {rows.map((s) => {
            const v = valueOf(s, metric);
            const before = beforeOf(s, metric);
            return (
              <li key={s.vendorId} className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[auto_minmax(120px,180px)_1fr_auto]">
                <Monogram code={s.code || s.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
                  <p className="text-xs tabular-nums text-ink-3">{total > 0 ? `${Math.round((v / total) * 100)}% of the court` : 'No sales yet'}</p>
                </div>
                <div className="col-span-2 h-6 overflow-hidden rounded-[6px] bg-surface-2 sm:col-span-1" aria-hidden>
                  <div className="h-full rounded-r-[4px] bg-accent transition-[width] duration-500 ease-out" style={{ width: `${(Math.max(0, v) / max) * 100}%` }} />
                </div>
                <div className="col-span-2 flex flex-wrap items-baseline justify-between gap-x-3 sm:col-span-1 sm:block sm:min-w-[150px] sm:text-right">
                  <p className="text-base font-semibold tabular-nums text-ink">{show(v)}</p>
                  {before !== undefined ? <Delta now={v} before={before} label={compare} /> : <span className="text-xs text-ink-3">{s.feePct ? `${s.feePct}% rate` : ''}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
