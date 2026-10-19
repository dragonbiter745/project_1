import { memo } from 'react';
import { MessageSquareText } from 'lucide-react';
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
  if (minutes >= 2) return 'bg-prep-tint text-prep ring-1 ring-inset ring-prep/20';
  return 'bg-surface-2 text-ink-2';
}

const EDGE = { NEW: 'bg-accent', COOKING: 'bg-prep', READY: 'bg-ready' } as const;

export const TicketCard = memo(function TicketCard({ sub, now, onAccept, onReject, onReady, onCollect }: TicketCardProps) {
  const minutes = Math.max(0, Math.floor((now - sub.ts.placed) / 60_000));
  const isNew = sub.status === 'NEW';
  const isReady = sub.status === 'READY';
  const edge = isNew ? EDGE.NEW : isReady ? EDGE.READY : EDGE.COOKING;

  return (
    <article
      aria-label={`Order ${sub.token}`}
      className={cx(
        'relative overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-inset',
        isNew ? 'ticket-alert ring-accent/50' : isReady ? 'ticket-in ring-ready/30' : 'ticket-in ring-line/70'
      )}
    >
      <span aria-hidden className={cx('absolute inset-y-0 left-0 w-1.5', edge)} />

      <header className={cx('flex items-start justify-between gap-3 py-3.5 pl-5 pr-4', isNew && 'bg-accent-tint/60', isReady && 'bg-ready-tint/60')}>
        <div className="min-w-0">
          <p className={cx('font-mono text-[26px] font-semibold leading-none tracking-tight', isReady ? 'text-ready' : 'text-ink')}>
            {sub.token}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 items-center rounded-[7px] bg-ink px-2 font-mono text-xs font-semibold text-surface">
              {sub.tableLabel}
            </span>
            {sub.customerDisplay && <span className="truncate text-sm text-ink-3">{sub.customerDisplay}</span>}
          </div>
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

      <ul className="space-y-3 border-t border-line/70 py-3.5 pl-5 pr-4">
        {sub.items.map((item, i) => (
          <li key={`${item.id}-${i}`} className="flex gap-3">
            <span className="grid h-8 min-w-8 shrink-0 place-items-center rounded-[9px] bg-surface-2 px-1.5 font-mono text-base font-semibold tabular-nums text-ink">
              {item.qty}
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-md font-medium leading-snug text-ink [overflow-wrap:anywhere]">{item.name}</p>
              {item.note && (
                <p className="mt-1.5 flex items-start gap-1.5 rounded-[9px] bg-prep-tint px-2.5 py-1.5 text-sm font-medium text-prep ring-1 ring-inset ring-prep/15">
                  <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                  {item.note}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <footer className="pb-4 pl-5 pr-4">
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
