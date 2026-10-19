import { memo } from 'react';
import type { SubOrder } from '@foodcourt/shared';
import { Button, cx } from '@foodcourt/ui';

interface TicketCardProps {
  sub: SubOrder;
  now: number;
  onAccept: (sub: SubOrder) => void;
  onReject: (sub: SubOrder) => void;
  onReady: (sub: SubOrder) => void;
  onCollect: (sub: SubOrder) => void;
}

// PRD FR-V1: colour escalates at 2 / 5 / 10 minutes since the order was placed.
function urgency(minutes: number): string {
  if (minutes >= 10) return 'bg-danger text-on-accent';
  if (minutes >= 5) return 'bg-prep text-on-accent';
  if (minutes >= 2) return 'bg-prep-tint text-prep';
  return 'bg-surface-2 text-ink-2';
}

export const TicketCard = memo(function TicketCard({ sub, now, onAccept, onReject, onReady, onCollect }: TicketCardProps) {
  const minutes = Math.max(0, Math.floor((now - sub.ts.placed) / 60_000));
  const isNew = sub.status === 'NEW';
  const isReady = sub.status === 'READY';

  return (
    <article
      aria-label={`Order ${sub.token}`}
      className={cx(
        'flex flex-col rounded-card bg-surface p-4 ring-1 ring-inset',
        isNew ? 'ticket-alert ring-accent/70' : isReady ? 'ticket-in ring-ready/40' : 'ticket-in ring-line'
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cx('font-mono text-2xl font-semibold tracking-tight', isReady ? 'text-ready' : 'text-ink')}>
            {sub.token}
          </p>
          <p className="mt-0.5 truncate text-sm text-ink-3">
            Table {sub.tableLabel}
            {sub.customerDisplay && ` · ${sub.customerDisplay}`}
          </p>
        </div>
        <span
          aria-label={`Placed ${minutes} minutes ago`}
          className={cx(
            'shrink-0 rounded-full px-2.5 py-1 font-mono text-sm font-semibold tabular-nums transition-colors duration-500',
            urgency(minutes)
          )}
        >
          {minutes}m
        </span>
      </header>

      <ul className="mt-3 space-y-2.5 border-t border-line pt-3">
        {sub.items.map((item, i) => (
          <li key={`${item.id}-${i}`} className="flex gap-3">
            <span className="w-9 shrink-0 font-mono text-lg font-semibold tabular-nums text-ink">{item.qty}×</span>
            <div className="min-w-0 pt-0.5">
              <p className="text-md font-medium leading-snug text-ink [overflow-wrap:anywhere]">{item.name}</p>
              {item.note && (
                <p className="mt-1 inline-block rounded-md bg-prep-tint px-2 py-0.5 text-sm font-medium text-prep">
                  {item.note}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <footer className="mt-4">
        {isNew && (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button variant="danger" size="lg" onClick={() => onReject(sub)} className="px-4">
              Reject
            </Button>
            <Button variant="accent" size="lg" onClick={() => onAccept(sub)}>
              Accept
            </Button>
          </div>
        )}
        {(sub.status === 'ACCEPTED' || sub.status === 'PREPARING') && (
          <Button variant="positive" size="lg" block onClick={() => onReady(sub)}>
            Mark ready
          </Button>
        )}
        {isReady && (
          <Button variant="outline" size="lg" block onClick={() => onCollect(sub)}>
            Collected
          </Button>
        )}
      </footer>
    </article>
  );
});
