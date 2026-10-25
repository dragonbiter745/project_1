import { useMemo, useState } from 'react';
import { ArrowRight, Ban, BookOpen, CalendarRange, Download, FileText, Landmark, Percent, Plus, Receipt, Search, TrendingUp, Users } from 'lucide-react';
import { EXPENSE_CATEGORIES, computeFounderBooks, expenseLabel, formatPaise, previousRange, splitByShare, type FounderEntry } from '@foodcourt/shared';
import { Button, Skeleton, cx } from '@foodcourt/ui';
import { Delta } from '../components/Delta';
import { KpiTile } from '../components/KpiTile';
import { LoadError } from '../components/LoadError';
import { Segmented } from '../components/Segmented';
import { TrendChart } from '../components/TrendChart';
import { downloadCsv, rupees } from '../lib/csv';
import { compactRupees, monthLabel, money } from '../lib/format';
import { compareLabel, formatDay, rangeLabel } from '../lib/range';
import type { PageProps } from '../types';
import { EntrySheet } from './EntrySheet';
import { VoidEntrySheet } from './VoidEntrySheet';

type MonthMetric = 'revenue' | 'expenses' | 'profit';

/**
 * The startup's books, kept here instead of a spreadsheet: revenue is the court's commission,
 * computed from orders automatically; expenses are added in a few taps; profit, the monthly report
 * and each founder's share are worked out live.
 */
export function RevenueExpenses({ range, report: { report }, books, go }: PageProps) {
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<FounderEntry | null>(null);
  const [category, setCategory] = useState('ALL');
  const [payer, setPayer] = useState('ALL');
  const [q, setQ] = useState('');
  const [metric, setMetric] = useState<MonthMetric>('revenue');
  const { entries, partners, income, error, reload } = books;

  const nameOf = (id?: string) => (id === 'court' || !id ? 'Startup account' : partners.find((p) => p.id === id)?.name ?? id);
  const inRange = (e: FounderEntry, from = range.from, to = range.to) => e.status === 'RECORDED' && e.date >= from && e.date <= to;

  const all = entries ?? [];
  const prev = previousRange(range.from, range.to);
  const revenue = report?.commissionPaise ?? 0;
  const revenueBefore = report?.previous.commissionPaise ?? 0;
  const period = computeFounderBooks(all, partners, revenue, range);
  const before = computeFounderBooks(all, partners, revenueBefore, prev);
  const lifetime = computeFounderBooks(all, partners, income?.lifetimeIncomePaise ?? 0);
  const cmp = compareLabel(range);

  const expenses = all.filter((e) => e.kind === 'EXPENSE');
  const periodExpenses = expenses.filter((e) => inRange(e));
  const byCategory = EXPENSE_CATEGORIES.map((c) => ({ ...c, total: periodExpenses.filter((e) => e.category === c.key).reduce((n, e) => n + e.amountPaise, 0) }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  const catMax = Math.max(1, ...byCategory.map((c) => c.total));
  const byPayer = [{ id: 'court', name: 'Startup account' }, ...partners].map((p) => ({ ...p, total: periodExpenses.filter((e) => (e.paidBy ?? 'court') === p.id).reduce((n, e) => n + e.amountPaise, 0) }));

  const months = useMemo(
    () =>
      (income?.months ?? []).map((m) => {
        const spent = expenses.filter((e) => e.status === 'RECORDED' && e.date.startsWith(m.month)).reduce((n, e) => n + e.amountPaise, 0);
        const profit = m.incomePaise - spent;
        return { month: m.month, revenue: m.incomePaise, expenses: spent, profit, shares: splitByShare(profit, partners) };
      }),
    [income, expenses, partners]
  );

  const ledger = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return expenses.filter(
      (e) =>
        e.date >= range.from &&
        e.date <= range.to &&
        (category === 'ALL' || e.category === category) &&
        (payer === 'ALL' || (e.paidBy ?? 'court') === payer) &&
        (!needle || `${e.note ?? ''} ${e.reference ?? ''} ${expenseLabel(e.category ?? '')}`.toLowerCase().includes(needle))
    );
  }, [expenses, range.from, range.to, category, payer, q]);

  if (!entries || !income) return error ? <LoadError text={error} onRetry={reload} /> : <Skeleton className="h-[480px] rounded-sheet" />;

  const exportLedger = () =>
    downloadCsv(
      `qrave-expenses-${range.from}_to_${range.to}.csv`,
      ['Date', 'What', 'Category', 'Paid by', 'Reference', 'Amount (Rs)', 'Status', 'Void reason', 'Recorded by'],
      ledger.map((e) => [e.date, e.note ?? '', expenseLabel(e.category ?? ''), nameOf(e.paidBy), e.reference ?? '', rupees(e.amountPaise), e.status, e.voidReason ?? '', e.createdBy])
    );
  const exportMonths = () =>
    downloadCsv(
      'qrave-monthly-report.csv',
      ['Month', 'Revenue (Rs)', 'Expenses (Rs)', 'Net profit (Rs)', ...partners.map((p) => `${p.name} share (Rs)`)],
      months.map((m) => [monthLabel(m.month), rupees(m.revenue), rupees(m.expenses), rupees(m.profit), ...partners.map((p) => rupees(m.shares[p.id] ?? 0))])
    );

  const chartPoints = months.map((m) => ({ key: m.month, value: metric === 'revenue' ? m.revenue : metric === 'expenses' ? m.expenses : Math.max(0, m.profit) }));
  const select = 'h-10 rounded-full bg-surface-2 px-4 text-sm font-medium text-ink outline-none focus:ring-2 focus:ring-accent/40';

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sheet bg-surface px-5 py-4 shadow-card ring-1 ring-inset ring-line/70">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-accent-tint text-accent-ink ring-1 ring-inset ring-accent-line">
            <BookOpen className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink">Your books live here</p>
            <p className="text-sm text-ink-3">Revenue comes in from orders on its own. Add each expense when you spend; everything below updates instantly.</p>
          </div>
        </div>
        <Button variant="accent" onClick={() => setAdding(true)} icon={<Plus className="h-4 w-4" strokeWidth={2.25} />}>
          Add expense
        </Button>
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile feature label="Revenue" value={money(revenue)} icon={TrendingUp} tone="accent" hint={<Delta now={revenue} before={revenueBefore} label={cmp} />} />
        <KpiTile label="Expenses" value={money(period.expensesPaise)} icon={Receipt} tone="danger" hint={<Delta now={period.expensesPaise} before={before.expensesPaise} label={cmp} goodWhenDown />} />
        <KpiTile
          label="Net profit"
          value={money(period.netProfitPaise)}
          icon={Percent}
          tone={period.netProfitPaise >= 0 ? 'ready' : 'danger'}
          alert={period.netProfitPaise < 0}
          hint={<Delta now={period.netProfitPaise} before={before.netProfitPaise} label={cmp} />}
        />
        <KpiTile
          label="Founder investment"
          value={money(lifetime.capitalPaise)}
          icon={Users}
          tone="neutral"
          hint={lifetime.partners.map((b) => `${b.partner.name.split(' ')[0]} ${compactRupees(b.capitalPaise + b.expensesPaidPaise)}`).join(' · ') + ' · all time'}
        />
      </dl>

      <nav aria-label="Reports" className="mt-4 flex flex-wrap items-center gap-2 rounded-sheet bg-surface px-5 py-3.5 shadow-card ring-1 ring-inset ring-line/70">
        <span className="mr-1 text-sm font-semibold text-ink-2">Pipeline</span>
        <a href="#ledger" className="inline-flex h-9 items-center gap-2 rounded-full bg-surface-2 px-3.5 text-sm font-medium text-ink hover:bg-accent-tint">
          <FileText className="h-4 w-4 text-ink-3" /> 1 · Expense ledger <span className="tabular-nums text-ink-3">{ledger.length}</span>
        </a>
        <ArrowRight className="h-4 w-4 text-ink-3" aria-hidden />
        <a href="#monthly" className="inline-flex h-9 items-center gap-2 rounded-full bg-surface-2 px-3.5 text-sm font-medium text-ink hover:bg-accent-tint">
          <CalendarRange className="h-4 w-4 text-ink-3" /> 2 · Monthly report
        </a>
        <ArrowRight className="h-4 w-4 text-ink-3" aria-hidden />
        <button type="button" onClick={() => go('founders')} className="inline-flex h-9 items-center gap-2 rounded-full bg-surface-2 px-3.5 text-sm font-medium text-ink hover:bg-accent-tint">
          <Landmark className="h-4 w-4 text-ink-3" /> 3 · Partner share report
        </button>
      </nav>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section aria-labelledby="cat-title" className="rounded-sheet bg-surface p-5 shadow-card ring-1 ring-inset ring-line/70 xl:col-span-2">
          <h2 id="cat-title" className="text-lg font-semibold tracking-tight text-ink">
            Where the money went
          </h2>
          <p className="text-sm text-ink-3">Expenses by category, {rangeLabel(range)}.</p>
          {byCategory.length === 0 ? (
            <p className="py-12 text-center text-sm text-ink-3">No expenses in this period. Press Add expense when you spend something.</p>
          ) : (
            <ul className="mt-5 space-y-3.5">
              {byCategory.map((c) => (
                <li key={c.key} className="grid grid-cols-[minmax(110px,190px)_1fr_auto] items-center gap-3">
                  <button type="button" onClick={() => setCategory(c.key)} className="truncate text-left text-sm font-medium text-ink hover:text-accent-ink">
                    {c.label}
                  </button>
                  <div className="h-5 overflow-hidden rounded-[6px] bg-surface-2" aria-hidden>
                    <div className="h-full rounded-r-[4px] bg-accent transition-[width] duration-500 ease-out" style={{ width: `${(c.total / catMax) * 100}%` }} />
                  </div>
                  <p className="w-[150px] text-right text-sm tabular-nums">
                    <span className="font-semibold text-ink">{money(c.total)}</span>
                    <span className="ml-2 text-ink-3">{Math.round((c.total / Math.max(1, period.expensesPaise)) * 100)}%</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="payer-title" className="rounded-sheet bg-surface p-5 shadow-card ring-1 ring-inset ring-line/70">
          <h2 id="payer-title" className="text-lg font-semibold tracking-tight text-ink">
            Who paid
          </h2>
          <p className="text-sm text-ink-3">Founders who paid from their own pocket get it counted as money put in.</p>
          <dl className="mt-4 divide-y divide-line/80">
            {byPayer.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-sm text-ink-2">{p.name}</dt>
                <dd className="text-sm font-semibold tabular-nums text-ink">{money(p.total)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section id="monthly" aria-labelledby="monthly-title" className="mt-4 scroll-mt-24 rounded-sheet bg-surface p-5 shadow-card ring-1 ring-inset ring-line/70">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="monthly-title" className="text-lg font-semibold tracking-tight text-ink">
              Monthly report
            </h2>
            <p className="text-sm text-ink-3">The last 12 months: revenue, expenses, profit and each founder's share.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Segmented
              label="Chart shows"
              value={metric}
              options={[
                { key: 'revenue', label: 'Revenue' },
                { key: 'expenses', label: 'Expenses' },
                { key: 'profit', label: 'Profit' },
              ]}
              onChange={setMetric}
            />
            <Button variant="outline" size="sm" onClick={exportMonths} icon={<Download className="h-4 w-4" />}>
              CSV
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <TrendChart points={chartPoints} granularity="month" format={(v) => formatPaise(v, true)} axis={compactRupees} label={`${metric} by month`} height={220} />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs text-ink-3">
              <tr className="border-b border-line">
                <th className="py-2.5 pr-3 font-medium">Month</th>
                <th className="px-3 py-2.5 text-right font-medium">Revenue</th>
                <th className="px-3 py-2.5 text-right font-medium">Expenses</th>
                <th className="px-3 py-2.5 text-right font-medium">Net profit</th>
                {partners.map((p) => (
                  <th key={p.id} className="px-3 py-2.5 text-right font-medium">
                    {p.name} <span className="text-ink-3">{p.shareBps / 100}%</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/80">
              {[...months].reverse().map((m) => (
                <tr key={m.month}>
                  <td className="py-2.5 pr-3 font-medium text-ink">{monthLabel(m.month)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{money(m.revenue)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{money(m.expenses)}</td>
                  <td className={cx('px-3 py-2.5 text-right font-semibold tabular-nums', m.profit < 0 ? 'text-danger' : 'text-ink')}>{money(m.profit)}</td>
                  {partners.map((p) => (
                    <td key={p.id} className="px-3 py-2.5 text-right tabular-nums text-ink-2">
                      {money(m.shares[p.id] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-line font-semibold text-ink">
              <tr>
                <td className="py-2.5 pr-3">12 months</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(months.reduce((n, m) => n + m.revenue, 0))}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(months.reduce((n, m) => n + m.expenses, 0))}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(months.reduce((n, m) => n + m.profit, 0))}</td>
                {partners.map((p) => (
                  <td key={p.id} className="px-3 py-2.5 text-right tabular-nums">
                    {money(months.reduce((n, m) => n + (m.shares[p.id] ?? 0), 0))}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section id="ledger" aria-labelledby="ledger-title" className="mt-4 scroll-mt-24 overflow-hidden rounded-sheet bg-surface shadow-card ring-1 ring-inset ring-line/70">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <div className="mr-auto">
            <h2 id="ledger-title" className="text-lg font-semibold tracking-tight text-ink">
              Expense ledger
            </h2>
            <p className="text-sm text-ink-3">{rangeLabel(range)}</p>
          </div>
          <label className="sr-only" htmlFor="exp-cat">
            Category
          </label>
          <select id="exp-cat" value={category} onChange={(e) => setCategory(e.target.value)} className={select}>
            <option value="ALL">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="exp-payer">
            Paid by
          </label>
          <select id="exp-payer" value={payer} onChange={(e) => setPayer(e.target.value)} className={select}>
            <option value="ALL">Anyone paid</option>
            <option value="court">Startup account</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="relative w-full sm:w-56">
            <span className="sr-only">Search expenses</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-10 w-full rounded-full bg-surface-2 pl-10 pr-4 text-sm text-ink outline-none placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-accent/40" />
          </label>
          <Button variant="outline" size="sm" disabled={ledger.length === 0} onClick={exportLedger} icon={<Download className="h-4 w-4" />}>
            Export CSV
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-bg/60 text-xs text-ink-3">
              <tr>
                <th className="py-3 pl-5 pr-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">What</th>
                <th className="px-3 py-3 font-medium">Category</th>
                <th className="px-3 py-3 font-medium">Paid by</th>
                <th className="px-3 py-3 font-medium">Reference</th>
                <th className="px-3 py-3 text-right font-medium">Amount</th>
                <th className="py-3 pl-3 pr-5" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/80">
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-sm text-ink-3">
                    No expenses match. Change the filters or the period, or add one.
                  </td>
                </tr>
              ) : (
                ledger.map((e) => {
                  const off = e.status === 'VOID';
                  return (
                    <tr key={e.id} className={cx(off ? 'text-ink-3' : 'transition-colors duration-150 hover:bg-accent-tint/40')}>
                      <td className="py-3 pl-5 pr-3 tabular-nums">{formatDay(e.date)}</td>
                      <td className="max-w-[260px] truncate px-3 py-3 text-ink" title={off ? `Voided: ${e.voidReason}` : e.note}>
                        {off ? <span className="text-danger">Void · {e.voidReason}</span> : e.note || '—'}
                      </td>
                      <td className="px-3 py-3 text-ink-2">{expenseLabel(e.category ?? '')}</td>
                      <td className="px-3 py-3 text-ink-2">{nameOf(e.paidBy)}</td>
                      <td className="px-3 py-3 font-mono text-[13px] text-ink-3">{e.reference ?? ''}</td>
                      <td className={cx('px-3 py-3 text-right font-semibold tabular-nums', off ? 'line-through' : 'text-ink')}>{formatPaise(e.amountPaise, true)}</td>
                      <td className="py-2 pl-3 pr-5 text-right">
                        {!off && (
                          <Button variant="danger" size="sm" onClick={() => setVoiding(e)} icon={<Ban className="h-4 w-4" />}>
                            Void
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

      <EntrySheet kind={adding ? 'EXPENSE' : null} partners={partners} onClose={() => setAdding(false)} onSaved={reload} />
      <VoidEntrySheet entry={voiding} onClose={() => setVoiding(null)} onDone={reload} />
    </>
  );
}
