import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { checkPayment, getMoneyHealth, resolveIssue, retryRefund, runReconcile, type MoneyHealthView } from '@foodcourt/firebase-client/finance';
import { formatPaise, getIstDateKey } from '@foodcourt/shared';
import { Button, cx, run } from '@foodcourt/ui';

const REASON: Record<string, string> = {
  refund_failed: 'Refund failed',
  chargeback: 'Chargeback',
  shop_unattended: 'Shop paused automatically',
  ticket_stuck: 'Ticket never finished',
};

const ago = (ms: number | null, now: number) => {
  if (!ms) return 'never';
  const min = Math.round((now - ms) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

const time = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/**
 * One page that answers "is the money safe right now?": the safety net is running, nothing is stuck, every
 * refund is on its way, and last night's checks against Razorpay passed. Every red line has a button.
 */
export function MoneyHealth() {
  const [data, setData] = useState<MoneyHealthView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getMoneyHealth());
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    // Refreshed every minute while the page is open and visible; no live listeners on money collections.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    await run(fn());
    setBusy(null);
    await load();
  };

  if (error && !data) return <p className="rounded-card bg-danger-tint p-4 text-sm text-danger">Could not load: {error}</p>;
  if (!data) return <p className="text-sm text-ink-3">Loading…</p>;

  const now = data.generatedAt;
  const sweeperLate = !data.sweeper.lastOkAt || now - data.sweeper.lastOkAt > 5 * 60_000;
  const yesterday = getIstDateKey(new Date(now - 86_400_000));

  return (
    <div className="max-w-4xl space-y-6">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile bad={sweeperLate} label="Safety net (sweeper)" value={sweeperLate ? 'Not running' : 'Running'} hint={`Last good run ${ago(data.sweeper.lastOkAt, now)}${data.sweeper.failedSteps.length ? ` · failing: ${data.sweeper.failedSteps.join(', ')}` : ''}`} />
        <Tile bad={data.unpaid.length > 0 && now - (data.unpaid[0]?.createdAt ?? now) > 30 * 60_000} label="Unpaid orders over 5 min" value={String(data.unpaid.length)} hint="Normal: diners who closed the payment window." />
        <Tile bad={data.refunds.failed.length > 0} label="Refunds" value={`${data.refunds.failed.length} failed`} hint={`${data.refunds.due} due · ${data.refunds.pending} on their way`} />
        <Tile
          bad={Boolean(data.reconciliation && !data.reconciliation.ok)}
          label="Last money check"
          value={data.reconciliation ? (data.reconciliation.ok ? 'Matches Razorpay' : `${data.reconciliation.discrepancies} differences`) : 'Not run yet'}
          hint={data.reconciliation ? `${data.reconciliation.dateKey}, ${ago(data.reconciliation.ranAt, now)}` : 'Runs at 23:30 and 06:30'}
        />
      </dl>

      {data.issues.length > 0 && (
        <Section title="Needs you" note="Each one is also an alert. Mark it handled once dealt with.">
          {data.issues.map((i) => (
            <Row key={i.id} danger>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{REASON[i.reason] ?? i.reason}</p>
                <p className="mt-0.5 text-sm text-ink-3">{i.text}</p>
                <p className="mt-0.5 text-xs text-ink-3">{ago(i.createdAt, now)}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                loading={busy === i.id}
                onClick={() => {
                  const note = window.prompt('What was done? (kept in the audit log)');
                  if (note && note.trim().length >= 3) void act(i.id, () => resolveIssue(i.id, note.trim()));
                }}
              >
                Mark handled
              </Button>
            </Row>
          ))}
        </Section>
      )}

      {data.refunds.failed.length > 0 && (
        <Section title="Failed refunds" note="Razorpay refused these. Retry sends a new refund; if it already went through, it is marked done instead.">
          {data.refunds.failed.map((r) => (
            <Row key={r.subOrderId} danger>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {r.token} · {r.vendorName} · {formatPaise(r.amountPaise)}
                </p>
                <p className="mt-0.5 text-sm text-ink-3">{r.failReason ?? 'No reason given by Razorpay.'}</p>
              </div>
              <Button variant="accent" size="sm" loading={busy === r.subOrderId} onClick={() => void act(r.subOrderId, () => retryRefund(r.subOrderId))}>
                Retry refund
              </Button>
            </Row>
          ))}
        </Section>
      )}

      {data.lateRefunds.length > 0 && (
        <Section title="Payments sent back in full" note="Money that arrived after its order had closed, or for the wrong amount. Refunded automatically.">
          {data.lateRefunds.map((l) => (
            <Row key={l.orderId} danger={l.status === 'FAILED'}>
              <p className="flex-1 text-sm text-ink">
                {formatPaise(l.amountPaise)} · payment {l.paymentId} · {l.reason === 'late' ? 'arrived late' : 'wrong amount'}
              </p>
              <span className={cx('text-xs font-semibold', l.status === 'FAILED' ? 'text-danger' : 'text-ink-3')}>{l.status === 'FAILED' ? 'Refund failed: refund it from the Razorpay dashboard' : 'On its way'}</span>
            </Row>
          ))}
        </Section>
      )}

      <Section title="Unpaid orders" note="Usually a diner who closed the payment window; they expire by themselves. Check one if a diner says they paid.">
        {data.unpaid.length === 0 ? (
          <Row>
            <p className="text-sm text-ink-3">None.</p>
          </Row>
        ) : (
          data.unpaid.map((o) => (
            <Row key={o.orderId}>
              <p className="flex-1 text-sm text-ink">
                {o.orderId.slice(0, 10)} · {formatPaise(o.totalPaise)} · since {time(o.createdAt)}
              </p>
              <Button variant="outline" size="sm" loading={busy === o.orderId} disabled={!o.rzpOrderId} onClick={() => void act(o.orderId, () => checkPayment(o.orderId))}>
                Check with Razorpay
              </Button>
            </Row>
          ))
        )}
      </Section>

      <Section title="Checks against Razorpay">
        <Row danger={Boolean(data.reconciliation && !data.reconciliation.ok)}>
          <div className="flex-1 text-sm text-ink">
            <p className="font-semibold">Payments vs our books</p>
            <p className="text-ink-3">
              {data.reconciliation
                ? `${data.reconciliation.dateKey}: Razorpay ${formatPaise(data.reconciliation.gatewayPaise)}, books ${formatPaise(data.reconciliation.bookPaise)}${data.reconciliation.ok ? ' (match)' : ` · ${data.reconciliation.discrepancies} to look at in reconciliationReports`}`
                : 'No report yet.'}
            </p>
          </div>
          <Button variant="outline" size="sm" loading={busy === 'recon-today'} onClick={() => void act('recon-today', () => runReconcile(getIstDateKey(new Date(now))))}>
            Check today
          </Button>
          <Button variant="outline" size="sm" loading={busy === 'recon-yday'} onClick={() => void act('recon-yday', () => runReconcile(yesterday))}>
            Check yesterday
          </Button>
        </Row>
        <Row danger={Boolean(data.settlement && !data.settlement.ok)}>
          <div className="flex-1 text-sm text-ink">
            <p className="font-semibold">What reached the bank</p>
            <p className="text-ink-3">
              {data.settlement
                ? `${data.settlement.dateKey}: net ${formatPaise(data.settlement.netPaise)} after Razorpay fee ${formatPaise(data.settlement.feePaise)} + GST ${formatPaise(data.settlement.taxPaise)}${data.settlement.unknownPayments ? ` · ${data.settlement.unknownPayments} payments not in our books` : ''}. Match it to the bank statement by UTR.`
                : 'Runs every morning at 07:15.'}
            </p>
          </div>
        </Row>
      </Section>
      {error && <p className="text-sm text-danger">Last refresh failed: {error}</p>}
    </div>
  );
}

function Tile({ label, value, hint, bad }: { label: string; value: string; hint: string; bad?: boolean }) {
  return (
    <div className={cx('rounded-card p-4 ring-1 ring-inset', bad ? 'bg-danger-tint ring-danger/40' : 'bg-surface ring-line')}>
      <dt className="text-xs font-medium text-ink-3">{label}</dt>
      <dd className={cx('mt-1 text-lg font-semibold tracking-tight', bad ? 'text-danger' : 'text-ink')}>{value}</dd>
      <dd className="mt-1 text-xs text-ink-3">{hint}</dd>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
      {note && <p className="mt-1 text-sm text-ink-3">{note}</p>}
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-inset ring-line">{children}</ul>
    </section>
  );
}

function Row({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return <li className={cx('flex flex-wrap items-center gap-3 px-4 py-3', danger && 'bg-danger-tint/40')}>{children}</li>;
}
