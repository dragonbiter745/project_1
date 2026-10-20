import { useEffect, useMemo, useState } from 'react';
import { Ban, Download, HandCoins, Landmark, RefreshCw } from 'lucide-react';
import { listPayouts, voidPayout } from '@foodcourt/firebase-client/finance';
import { formatPaise, type Payout } from '@foodcourt/shared';
import { Button, Sheet, Skeleton, cx } from '@foodcourt/ui';
import type { PageProps } from '../../App';
import { Field, FormError, inputClass } from '../../components/Field';
import { PayoutSheet } from '../../components/PayoutSheet';
import { downloadCsv, rupees } from '../../lib/csv';
import { formatDay } from '../../lib/range';
import { formatTime } from '../../lib/orderStatus';
import { LoadError } from '../overview/Overview';

export function Payouts({ range, report: { report, reload: reloadReport } }: PageProps) {
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shop, setShop] = useState('ALL');
  const [recording, setRecording] = useState(false);
  const [voiding, setVoiding] = useState<Payout | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setError(null);
    listPayouts().then(
      (p) => live && setPayouts(p),
      (e: Error) => live && setError(e.message)
    );
    return () => {
      live = false;
    };
  }, [tick]);

  const refresh = () => {
    setTick((t) => t + 1);
    reloadReport();
  };

  const shops = report?.shops ?? [];
  const rows = useMemo(
    () => (payouts ?? []).filter((p) => p.paidOn >= range.from && p.paidOn <= range.to && (shop === 'ALL' || p.vendorId === shop)),
    [payouts, range.from, range.to, shop]
  );
  const total = rows.filter((p) => p.status === 'RECORDED').reduce((n, p) => n + p.amountPaise, 0);
  const due = shops.filter((s) => shop === 'ALL' || s.vendorId === shop).reduce((n, s) => n + Math.max(0, s.balanceDuePaise), 0);

  const exportCsv = () =>
    downloadCsv(
      `reva-payouts-${range.from}_to_${range.to}.csv`,
      ['Paid on', 'Shop', 'Amount (Rs)', 'UTR / reference', 'Note', 'Status', 'Recorded by', 'Recorded at', 'Void reason'],
      rows.map((p) => [p.paidOn, p.vendorName, rupees(p.amountPaise), p.reference, p.note ?? '', p.status, p.createdBy, formatTime(p.createdAt), p.voidReason ?? ''])
    );

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Paid out in this period" value={formatPaise(total, total % 100 !== 0)} hint={`${rows.filter((p) => p.status === 'RECORDED').length} payouts`} />
        <Stat label="Still owed to shops" value={report ? formatPaise(due, due % 100 !== 0) : '…'} hint="All time, after every payout" tone={due > 0 ? 'prep' : undefined} />
        <div className="flex flex-col justify-center gap-2 rounded-sheet bg-surface p-5 shadow-card ring-1 ring-inset ring-line/70">
          <p className="text-sm text-ink-2">Sent money to a shop by bank or UPI? Log it here with the UTR so balances stay right.</p>
          <Button variant="accent" disabled={shops.length === 0} onClick={() => setRecording(true)} icon={<HandCoins className="h-4 w-4" />}>
            Record a payout
          </Button>
        </div>
      </div>

      <section aria-label="Payout history" className="mt-6 overflow-hidden rounded-sheet bg-surface shadow-card ring-1 ring-inset ring-line/70">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <label htmlFor="payout-shop" className="sr-only">
            Shop
          </label>
          <select
            id="payout-shop"
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            className="h-10 rounded-full bg-surface-2 px-4 text-sm font-medium text-ink outline-none focus:ring-2 focus:ring-accent/40"
          >
            <option value="ALL">All shops</option>
            {shops.map((s) => (
              <option key={s.vendorId} value={s.vendorId}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={refresh} icon={<RefreshCw className="h-4 w-4" />}>
              Refresh
            </Button>
            <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={exportCsv} icon={<Download className="h-4 w-4" />}>
              Export CSV
            </Button>
          </div>
        </div>
        {error && (
          <div className="p-4">
            <LoadError text={error} onRetry={refresh} />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-bg/60 text-xs text-ink-3">
              <tr>
                <th className="py-3 pl-5 pr-3 font-medium">Paid on</th>
                <th className="px-3 py-3 font-medium">Shop</th>
                <th className="px-3 py-3 text-right font-medium">Amount</th>
                <th className="px-3 py-3 font-medium">UTR / reference</th>
                <th className="px-3 py-3 font-medium">Note</th>
                <th className="px-3 py-3 font-medium">Recorded by</th>
                <th className="py-3 pl-3 pr-5" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/80">
              {payouts === null && !error ? (
                Array.from({ length: 4 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-5 py-3">
                      <Skeleton className="h-6" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16">
                    <div className="flex flex-col items-center text-center">
                      <span className="grid h-14 w-14 place-items-center rounded-[18px] bg-accent-tint text-accent-ink ring-1 ring-inset ring-accent-line">
                        <Landmark className="h-6 w-6" strokeWidth={1.75} />
                      </span>
                      <p className="mt-4 text-base font-semibold text-ink">No payouts in this period</p>
                      <p className="mt-1 max-w-sm text-sm text-ink-3">Each time you transfer money to a shop, record it here so the balance due stays correct.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((p) => {
                  const off = p.status === 'VOID';
                  return (
                    <tr key={p.id} className={cx('transition-colors duration-150', off ? 'text-ink-3' : 'hover:bg-accent-tint/40')}>
                      <td className="py-3.5 pl-5 pr-3 tabular-nums">{formatDay(p.paidOn)}</td>
                      <td className="px-3 py-3.5 font-medium text-ink">{p.vendorName}</td>
                      <td className={cx('px-3 py-3.5 text-right font-semibold tabular-nums', off ? 'line-through' : 'text-ink')}>{formatPaise(p.amountPaise, true)}</td>
                      <td className="px-3 py-3.5 font-mono text-[13px]">{p.reference}</td>
                      <td className="max-w-[220px] truncate px-3 py-3.5" title={off ? `Voided: ${p.voidReason}` : p.note}>
                        {off ? <span className="font-medium text-danger">Voided · {p.voidReason}</span> : p.note || '—'}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-3.5 text-ink-2" title={formatTime(p.createdAt)}>
                        {p.createdBy}
                      </td>
                      <td className="py-2 pl-3 pr-5 text-right">
                        {!off && (
                          <Button variant="danger" size="sm" onClick={() => setVoiding(p)} icon={<Ban className="h-4 w-4" />}>
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

      <PayoutSheet open={recording} shops={shops} vendorId={shop === 'ALL' ? undefined : shop} onClose={() => setRecording(false)} onSaved={refresh} />
      <VoidSheet payout={voiding} onClose={() => setVoiding(null)} onDone={refresh} />
    </>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: 'prep' }) {
  return (
    <div className="rounded-sheet bg-surface p-5 shadow-card ring-1 ring-inset ring-line/70">
      <p className="text-sm font-medium text-ink-2">{label}</p>
      <p className={cx('mt-3 text-[32px] font-semibold leading-none tracking-tight tabular-nums', tone === 'prep' ? 'text-prep' : 'text-ink')}>{value}</p>
      <p className="mt-2 text-sm text-ink-3">{hint}</p>
    </div>
  );
}

function VoidSheet({ payout, onClose, onDone }: { payout: Payout | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setReason('');
    setError('');
  }, [payout]);

  const confirm = async () => {
    if (!payout) return;
    if (reason.trim().length < 3) return setError('Say why, so the next person reading this understands.');
    setBusy(true);
    try {
      await voidPayout(payout.id, reason.trim());
      onDone();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={payout !== null}
      onClose={onClose}
      title="Void this payout?"
      description={payout ? `${formatPaise(payout.amountPaise, true)} to ${payout.vendorName} on ${formatDay(payout.paidOn)}. It stays in the history, marked void, and the amount goes back onto the balance due.` : undefined}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="ink" size="lg" loading={busy} onClick={() => void confirm()} className="bg-danger">
            Void payout
          </Button>
        </div>
      }
    >
      <div className="space-y-3 px-5 pb-2">
        <Field label="Reason">
          {(id) => <input id={id} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered for the wrong shop" className={inputClass} />}
        </Field>
        <FormError text={error} />
      </div>
    </Sheet>
  );
}
