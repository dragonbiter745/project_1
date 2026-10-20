import { Minus, Plus } from 'lucide-react';
import { formatPaise, type SubOrder, type Vendor } from '@foodcourt/shared';
import { Sheet, cx, useNow } from '@foodcourt/ui';
import { run } from '@foodcourt/ui';
import { setPrepMinutes } from '@foodcourt/firebase-client/ops';
import { jsonEqual, useLocal } from '../../lib/store';
import { todayStats } from '@foodcourt/shared';

const formatTime = (ms: number) =>
  new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(ms);

const OUTCOME: Record<string, { label: string; tone: string }> = {
  COLLECTED: { label: 'Collected', tone: 'text-ready' },
  REJECTED: { label: 'Rejected', tone: 'text-danger' },
  TIMED_OUT: { label: 'Not accepted in time', tone: 'text-danger' },
  CANCELLED: { label: 'Cancelled', tone: 'text-ink-3' },
};

export function TodaySheet({ vendor, open, onClose }: { vendor: Vendor; open: boolean; onClose: () => void }) {
  const subs = useLocal((s) => Object.values(s.subOrders).filter((sub) => sub.vendorId === vendor.id), jsonEqual);
  const now = useNow(60_000, open);
  const stats = todayStats(subs, now);

  return (
    <Sheet open={open} onClose={onClose} title="Today" description={vendor.name}>
      <dl className="grid grid-cols-2 gap-2">
        <Stat label="Orders collected" value={String(stats.collected)} />
        <Stat label="Collected sales" value={formatPaise(stats.salesPaise)} />
        <Stat
          label="Accept to ready (median)"
          value={stats.medianReadyMin === null ? 'No data yet' : `${Math.round(stats.medianReadyMin)} min`}
          muted={stats.medianReadyMin === null}
        />
        <Stat label="Rejected or missed" value={String(stats.rejected)} warn={stats.rejected > 0} />
      </dl>

      <section aria-labelledby="prep-title" className="mt-5 flex items-center justify-between gap-4 rounded-card p-4 ring-1 ring-inset ring-line">
        <div className="min-w-0">
          <h3 id="prep-title" className="text-base font-semibold text-ink">
            Usual prep time
          </h3>
          <p className="mt-0.5 text-sm text-ink-3">Diners see this as their typical wait.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-surface-2 p-1">
          <StepButton label="Shorter" onClick={() => void run(setPrepMinutes(vendor.id, vendor.defaultPrepMin - 1))} disabled={vendor.defaultPrepMin <= 3}>
            <Minus className="h-4 w-4" strokeWidth={2.25} />
          </StepButton>
          <span className="w-16 text-center font-mono text-lg font-semibold tabular-nums text-ink" aria-live="polite">
            {vendor.defaultPrepMin} min
          </span>
          <StepButton label="Longer" onClick={() => void run(setPrepMinutes(vendor.id, vendor.defaultPrepMin + 1))} disabled={vendor.defaultPrepMin >= 60}>
            <Plus className="h-4 w-4" strokeWidth={2.25} />
          </StepButton>
        </div>
      </section>

      <h3 className="mt-6 text-base font-semibold text-ink">Finished orders</h3>
      {stats.finished.length === 0 ? (
        <p className="mt-2 rounded-card bg-surface-2 p-4 text-sm text-ink-3">Orders appear here once they are collected or rejected.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-card ring-1 ring-inset ring-line">
          {stats.finished.map((sub) => (
            <FinishedRow key={sub.id} sub={sub} />
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function Stat({ label, value, muted, warn }: { label: string; value: string; muted?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-card bg-surface-2 p-4">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd
        className={cx(
          'mt-1 font-semibold tabular-nums tracking-tight',
          muted ? 'text-base text-ink-3' : 'text-2xl',
          warn ? 'text-danger' : !muted && 'text-ink'
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function StepButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="pressable grid h-11 w-11 place-items-center rounded-full text-ink-2 disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function FinishedRow({ sub }: { sub: SubOrder }) {
  const outcome = OUTCOME[sub.status] ?? { label: sub.status, tone: 'text-ink-3' };
  return (
    <li className="flex items-start gap-4 px-4 py-3">
      <div className="w-20 shrink-0">
        <p className="font-mono text-base font-semibold text-ink">{sub.token}</p>
        <p className="text-xs tabular-nums text-ink-3">{formatTime(sub.ts.placed)}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink-2">{sub.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</p>
        <p className={cx('text-xs font-medium', outcome.tone)}>
          {outcome.label}
          {sub.rejectReason && `: ${sub.rejectReason}`}
        </p>
      </div>
      <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">{formatPaise(sub.subtotalPaise)}</p>
    </li>
  );
}
