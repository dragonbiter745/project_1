import { useState } from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Ban, CheckCircle2, Download, Pencil, Printer } from 'lucide-react';
import { computeFounderBooks, formatPaise, type FounderEntry } from '@foodcourt/shared';
import { Button, Skeleton, cx } from '@foodcourt/ui';
import { LoadError } from '../components/LoadError';
import { downloadCsv, rupees } from '../lib/csv';
import { money } from '../lib/format';
import { formatDay, rangeLabel } from '../lib/range';
import type { PageProps } from '../types';
import { EntrySheet, type EntryKind } from './EntrySheet';
import { PartnersSheet } from './PartnersSheet';
import { VoidEntrySheet } from './VoidEntrySheet';

/**
 * The three founders' side of the books: what each put in, took out and is owed, a check that
 * nobody has drawn more than their share, and the partner share report for any period.
 */
export function Founders({ range, report: { report }, books }: PageProps) {
  const [adding, setAdding] = useState<EntryKind | null>(null);
  const [editing, setEditing] = useState(false);
  const [voiding, setVoiding] = useState<FounderEntry | null>(null);
  const { entries, partners, income, error, reload } = books;

  if (!entries || !income) return error ? <LoadError text={error} onRetry={reload} /> : <Skeleton className="h-[480px] rounded-sheet" />;

  const lifetime = computeFounderBooks(entries, partners, income.lifetimeIncomePaise);
  const period = computeFounderBooks(entries, partners, report?.commissionPaise ?? 0, range);
  const overdrawn = lifetime.partners.filter((b) => b.balancePaise < 0);
  const moves = entries.filter((e) => e.kind !== 'EXPENSE');
  const nameOf = (id?: string) => partners.find((p) => p.id === id)?.name ?? id ?? '—';

  const exportPsr = () =>
    downloadCsv(
      `reva-partner-share-${range.from}_to_${range.to}.csv`,
      ['Founder', 'Share %', 'Profit share (Rs)', 'Invested in period (Rs)', 'Withdrawn in period (Rs)', 'Net for period (Rs)'],
      [
        ...period.partners.map((b) => [b.partner.name, b.partner.shareBps / 100, rupees(b.profitSharePaise), rupees(b.capitalPaise + b.expensesPaidPaise), rupees(b.drawingsPaise), rupees(b.balancePaise)]),
        ['Revenue', '', rupees(period.incomePaise), '', '', ''],
        ['Expenses', '', rupees(period.expensesPaise), '', '', ''],
        ['Net profit', '', rupees(period.netProfitPaise), '', '', ''],
      ]
    );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3" data-print="hide">
        <p className="text-sm text-ink-3">All-time figures. The partner share report below follows the period you pick above.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" size="sm" onClick={() => setAdding('CAPITAL')} icon={<ArrowDownLeft className="h-4 w-4" />}>
            Add investment
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAdding('DRAWING')} icon={<ArrowUpRight className="h-4 w-4" />}>
            Record withdrawal
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} icon={<Pencil className="h-4 w-4" />}>
            Edit shares
          </Button>
        </div>
      </div>

      <p
        data-print="hide"
        role="status"
        className={cx(
          'mt-4 flex items-start gap-2.5 rounded-card px-4 py-3 text-sm ring-1 ring-inset',
          overdrawn.length ? 'bg-danger-tint text-danger ring-danger/20' : 'bg-ready-tint text-ready ring-ready/20'
        )}
      >
        {overdrawn.length ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
        <span className="font-medium">
          {overdrawn.length
            ? `${overdrawn.map((b) => b.partner.name).join(' and ')} ${overdrawn.length === 1 ? 'has' : 'have'} taken out more than they put in plus their profit share (${overdrawn.map((b) => money(-b.balancePaise)).join(', ')} over).`
            : 'Books balance: no founder has taken out more than they put in plus their share of profit.'}
        </span>
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-3" data-print="hide">
        {lifetime.partners.map((b) => (
          <article key={b.partner.id} className="rounded-sheet bg-surface p-5 shadow-card ring-1 ring-inset ring-line/70">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-accent-tint font-semibold text-accent-ink ring-1 ring-inset ring-accent-line">
                  {b.partner.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{b.partner.name}</p>
                  <p className="text-xs text-ink-3">{b.partner.shareBps / 100}% of profit</p>
                </div>
              </div>
            </div>
            <p className={cx('mt-4 text-[30px] font-semibold leading-none tracking-tight tabular-nums', b.balancePaise < 0 ? 'text-danger' : 'text-ink')}>{money(b.balancePaise)}</p>
            <p className="mt-1 text-xs text-ink-3">Balance: what the startup owes {b.partner.name.split(' ')[0]}</p>
            <dl className="mt-4 divide-y divide-line/80 border-t border-line/80 text-sm">
              <Row label="Invested" value={money(b.capitalPaise)} />
              <Row label="Expenses paid personally" value={money(b.expensesPaidPaise)} />
              <Row label="Share of profit" value={money(b.profitSharePaise)} tone={b.profitSharePaise < 0 ? 'danger' : undefined} />
              <Row label="Withdrawn" value={`− ${money(b.drawingsPaise)}`} />
            </dl>
          </article>
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-sheet bg-line/70 shadow-card ring-1 ring-inset ring-line/70 md:grid-cols-5" data-print="hide">
        <Stat label="Revenue, all time" value={money(lifetime.incomePaise)} />
        <Stat label="Expenses, all time" value={money(lifetime.expensesPaise)} />
        <Stat label="Net profit" value={money(lifetime.netProfitPaise)} />
        <Stat label="Withdrawn by founders" value={money(lifetime.drawingsPaise)} />
        <Stat label="Kept in the startup" value={money(lifetime.retainedPaise)} />
      </dl>

      <section aria-labelledby="psr-title" className="mt-4 rounded-sheet bg-surface p-5 shadow-card ring-1 ring-inset ring-line/70">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">REVA Food Court</p>
            <h2 id="psr-title" className="mt-0.5 text-lg font-semibold tracking-tight text-ink">
              Partner share report
            </h2>
            <p className="text-sm text-ink-3">{rangeLabel(range)}</p>
          </div>
          <div className="flex gap-2" data-print="hide">
            <Button variant="outline" size="sm" onClick={exportPsr} icon={<Download className="h-4 w-4" />}>
              CSV
            </Button>
            <Button variant="ink" size="sm" onClick={() => window.print()} icon={<Printer className="h-4 w-4" />}>
              Print or save PDF
            </Button>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 rounded-card bg-surface-2/70 p-4 text-sm">
          <div>
            <dt className="text-ink-3">Revenue</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{money(period.incomePaise)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Expenses</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">− {money(period.expensesPaise)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Net profit</dt>
            <dd className={cx('mt-0.5 text-lg font-semibold tabular-nums', period.netProfitPaise < 0 ? 'text-danger' : 'text-ink')}>{money(period.netProfitPaise)}</dd>
          </div>
        </dl>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="text-xs text-ink-3">
              <tr className="border-b border-line">
                <th className="py-2.5 pr-3 font-medium">Founder</th>
                <th className="px-3 py-2.5 text-right font-medium">Share</th>
                <th className="px-3 py-2.5 text-right font-medium">Profit share</th>
                <th className="px-3 py-2.5 text-right font-medium">Put in</th>
                <th className="px-3 py-2.5 text-right font-medium">Taken out</th>
                <th className="py-2.5 pl-3 text-right font-medium">Net for period</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/80">
              {period.partners.map((b) => (
                <tr key={b.partner.id}>
                  <td className="py-2.5 pr-3 font-medium text-ink">{b.partner.name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{b.partner.shareBps / 100}%</td>
                  <td className={cx('px-3 py-2.5 text-right tabular-nums', b.profitSharePaise < 0 ? 'text-danger' : 'text-ink-2')}>{money(b.profitSharePaise)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{money(b.capitalPaise + b.expensesPaidPaise)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{money(b.drawingsPaise)}</td>
                  <td className={cx('py-2.5 pl-3 text-right font-semibold tabular-nums', b.balancePaise < 0 ? 'text-danger' : 'text-ink')}>{money(b.balancePaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-3">
          Revenue is the court's commission on shop orders. Profit is split by each founder's share; "net for period" is profit share plus money put in, minus money taken out.
        </p>
      </section>

      <section aria-labelledby="moves-title" className="mt-4 overflow-hidden rounded-sheet bg-surface shadow-card ring-1 ring-inset ring-line/70" data-print="hide">
        <div className="border-b border-line px-5 py-4">
          <h2 id="moves-title" className="text-lg font-semibold tracking-tight text-ink">
            Investments and withdrawals
          </h2>
          <p className="text-sm text-ink-3">Every rupee a founder put in or took out, all time.</p>
        </div>
        <ul className="divide-y divide-line/80">
          {moves.length === 0 ? (
            <li className="px-5 py-12 text-center text-sm text-ink-3">Nothing yet. Record each founder's investment with Add investment.</li>
          ) : (
            moves.map((e) => {
              const off = e.status === 'VOID';
              const inflow = e.kind === 'CAPITAL';
              return (
                <li key={e.id} className={cx('flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3 text-sm', off && 'text-ink-3')}>
                  <span className="w-28 tabular-nums">{formatDay(e.date)}</span>
                  <span className={cx('inline-flex w-28 items-center gap-1 font-medium', off ? '' : inflow ? 'text-ready' : 'text-prep')}>
                    {inflow ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    {inflow ? 'Invested' : 'Withdrew'}
                  </span>
                  <span className="w-32 font-medium text-ink">{nameOf(e.partnerId)}</span>
                  <span className={cx('w-28 font-semibold tabular-nums', off ? 'line-through' : 'text-ink')}>{formatPaise(e.amountPaise, true)}</span>
                  <span className="min-w-0 flex-1 truncate">{off ? <span className="text-danger">Void · {e.voidReason}</span> : e.note ?? ''}</span>
                  {!off && (
                    <Button variant="danger" size="sm" onClick={() => setVoiding(e)} icon={<Ban className="h-4 w-4" />}>
                      Void
                    </Button>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </section>

      <EntrySheet kind={adding} partners={partners} onClose={() => setAdding(null)} onSaved={reload} />
      <PartnersSheet open={editing} partners={partners} onClose={() => setEditing(false)} onSaved={reload} />
      <VoidEntrySheet entry={voiding} onClose={() => setVoiding(null)} onDone={reload} />
    </>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="flex justify-between gap-3 py-2">
      <dt className="text-ink-3">{label}</dt>
      <dd className={cx('font-semibold tabular-nums', tone === 'danger' ? 'text-danger' : 'text-ink')}>{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-5 py-4">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}
