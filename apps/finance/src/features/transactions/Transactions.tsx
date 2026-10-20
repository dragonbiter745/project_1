import { useEffect, useState, type FormEvent } from 'react';
import { Download, Inbox, Search, X } from 'lucide-react';
import { allOrders, listOrders, searchOrders, type LedgerFilter, type LedgerOrder, type LedgerPage } from '@foodcourt/firebase-client/finance';
import { formatPaise } from '@foodcourt/shared';
import { Button, Skeleton, cx, run } from '@foodcourt/ui';
import type { PageProps } from '../../App';
import { downloadCsv, rupees } from '../../lib/csv';
import { ORDER_STATUS, formatTime, maskPhone, methodLabel } from '../../lib/orderStatus';
import { LoadError } from '../overview/Overview';
import { OrderSheet } from './OrderSheet';

const FILTERS: Array<{ key: LedgerFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'Paid' },
  { key: 'pending', label: 'Awaiting payment' },
  { key: 'failed', label: 'Failed' },
  { key: 'refunded', label: 'Refunded' },
];

const statusOf = (o: LedgerOrder) => ORDER_STATUS[(o.payment?.status as string) === 'FLAGGED' ? 'FLAGGED' : o.status] ?? ORDER_STATUS.CREATED;

export function Transactions({ range }: PageProps) {
  const [filter, setFilter] = useState<LedgerFilter>('all');
  const [rows, setRows] = useState<LedgerOrder[]>([]);
  const [cursor, setCursor] = useState<LedgerPage['cursor']>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [searched, setSearched] = useState<LedgerOrder[] | null>(null);
  const [open, setOpen] = useState<LedgerOrder | null>(null);
  const [exporting, setExporting] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    listOrders(range.from, range.to, filter)
      .then((p) => {
        if (!live) return;
        setRows(p.rows);
        setCursor(p.cursor);
      })
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [range.from, range.to, filter, tick]);

  const loadMore = async () => {
    if (!cursor) return;
    setMore(true);
    try {
      const p = await listOrders(range.from, range.to, filter, cursor);
      setRows((r) => [...r, ...p.rows]);
      setCursor(p.cursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMore(false);
    }
  };

  const search = (e: FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return setSearched(null);
    void searchOrders(term).then(setSearched, (err: Error) => setError(err.message));
  };

  const exportCsv = async () => {
    setExporting(true);
    await run(
      allOrders(range.from, range.to, filter).then((list) =>
        downloadCsv(
          `reva-transactions-${range.from}_to_${range.to}${filter === 'all' ? '' : `-${filter}`}.csv`,
          ['Placed at', 'Order ID', 'Status', 'Payment', 'Method', 'Amount (Rs)', 'Table', 'Diner phone', 'Cashfree order', 'Cashfree payment', 'Paid at', 'Shops'],
          list.map((o) => [
            formatTime(o.createdAt),
            o.id,
            statusOf(o).label,
            o.payment?.mode ?? '',
            methodLabel(o.payment?.mode, o.payment?.method),
            rupees(o.totals?.totalPaise),
            o.tableLabel,
            o.customerPhone ?? '',
            o.payment?.cfOrderId ?? '',
            o.payment?.cfPaymentId ?? '',
            formatTime(o.payment?.paidAt),
            [...new Set(o.items.map((i) => i.vendorId))].length,
          ])
        )
      )
    );
    setExporting(false);
  };

  const shown = searched ?? rows;

  return (
    <section aria-label="Transactions" className="overflow-hidden rounded-sheet bg-surface shadow-card ring-1 ring-inset ring-line/70">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <div role="tablist" aria-label="Payment state" className="no-scrollbar -mx-1 flex max-w-full gap-1 overflow-x-auto px-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key && !searched}
              onClick={() => {
                setSearched(null);
                setTerm('');
                setFilter(f.key);
              }}
              className={cx(
                'h-9 shrink-0 rounded-full px-3.5 text-sm font-medium transition-colors duration-150',
                filter === f.key && !searched ? 'bg-accent-tint text-accent-ink ring-1 ring-inset ring-accent-line' : 'text-ink-2 hover:bg-surface-2'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <form onSubmit={search} className="relative ml-auto w-full sm:w-72" role="search">
          <label htmlFor="tx-search" className="sr-only">
            Find by order ID or phone
          </label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" strokeWidth={2} />
          <input
            id="tx-search"
            type="search"
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              if (!e.target.value) setSearched(null);
            }}
            placeholder="Order ID or phone, then Enter"
            className="h-10 w-full rounded-full bg-surface-2 pl-10 pr-4 text-sm text-ink outline-none transition-[background-color,box-shadow] placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-accent/40"
          />
        </form>
        <Button variant="outline" size="sm" loading={exporting} disabled={rows.length === 0} onClick={() => void exportCsv()} icon={<Download className="h-4 w-4" />}>
          Export CSV
        </Button>
      </div>

      {searched && (
        <div className="flex items-center justify-between gap-3 border-b border-line bg-accent-tint/50 px-5 py-2.5 text-sm text-ink-2">
          <span>
            {searched.length === 0 ? 'No order matches' : `${searched.length} ${searched.length === 1 ? 'order matches' : 'orders match'}`} “{term.trim()}”, any date
          </span>
          <button type="button" onClick={() => (setSearched(null), setTerm(''))} className="inline-flex items-center gap-1 font-medium text-accent-ink">
            <X className="h-4 w-4" /> Clear
          </button>
        </div>
      )}

      {error && (
        <div className="p-4">
          <LoadError text={error} onRetry={() => setTick((t) => t + 1)} />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-bg/60 text-xs text-ink-3">
            <tr>
              <th className="py-3 pl-5 pr-3 font-medium">Placed</th>
              <th className="px-3 py-3 font-medium">Order</th>
              <th className="px-3 py-3 font-medium">Table</th>
              <th className="px-3 py-3 font-medium">Diner</th>
              <th className="px-3 py-3 font-medium">Method</th>
              <th className="px-3 py-3 text-right font-medium">Amount</th>
              <th className="py-3 pl-3 pr-5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/80">
            {loading && !searched ? (
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-5 py-3">
                    <Skeleton className="h-6" />
                  </td>
                </tr>
              ))
            ) : shown.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-16">
                  <div className="flex flex-col items-center text-center">
                    <span className="grid h-14 w-14 place-items-center rounded-[18px] bg-accent-tint text-accent-ink ring-1 ring-inset ring-accent-line">
                      <Inbox className="h-6 w-6" strokeWidth={1.75} />
                    </span>
                    <p className="mt-4 text-base font-semibold text-ink">No transactions here</p>
                    <p className="mt-1 max-w-sm text-sm text-ink-3">Try another period or payment state. Every order placed at a table shows up here.</p>
                  </div>
                </td>
              </tr>
            ) : (
              shown.map((o) => {
                const s = statusOf(o);
                return (
                  <tr key={o.id} onClick={() => setOpen(o)} className="cursor-pointer transition-colors duration-150 hover:bg-accent-tint/40">
                    <td className="py-3.5 pl-5 pr-3 tabular-nums text-ink-2">{formatTime(o.createdAt)}</td>
                    <td className="px-3 py-3.5">
                      <button type="button" className="font-mono text-[13px] font-semibold text-ink hover:text-accent-ink" onClick={() => setOpen(o)}>
                        {o.id.slice(0, 12)}…
                      </button>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="inline-flex h-7 items-center rounded-[8px] bg-surface-2 px-2.5 font-mono text-xs font-semibold text-ink-2">{o.tableLabel}</span>
                    </td>
                    <td className="px-3 py-3.5 tabular-nums text-ink-2">{maskPhone(o.customerPhone)}</td>
                    <td className="px-3 py-3.5 text-ink-2">{methodLabel(o.payment?.mode, o.payment?.method)}</td>
                    <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-ink">{formatPaise(o.totals?.totalPaise ?? 0, true)}</td>
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

      {!searched && cursor && (
        <div className="border-t border-line px-5 py-3 text-center">
          <Button variant="ghost" size="sm" loading={more} onClick={() => void loadMore()}>
            Show more
          </Button>
        </div>
      )}

      <OrderSheet order={open} onClose={() => setOpen(null)} />
    </section>
  );
}
