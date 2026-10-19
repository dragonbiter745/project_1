import type { SubOrderStatus } from '@foodcourt/shared';
import { cx } from '@foodcourt/ui';

// Status is a real state, so each pill carries a small marker in the same tone plus its label.
const STATUS: Record<SubOrderStatus, { label: string; tone: string; mark: string }> = {
  NEW: { label: 'New', tone: 'bg-accent-tint text-accent-ink ring-accent-line', mark: 'bg-accent' },
  ACCEPTED: { label: 'Cooking', tone: 'bg-prep-tint text-prep ring-prep/20', mark: 'bg-prep' },
  PREPARING: { label: 'Cooking', tone: 'bg-prep-tint text-prep ring-prep/20', mark: 'bg-prep' },
  READY: { label: 'Ready', tone: 'bg-ready-tint text-ready ring-ready/20', mark: 'bg-ready' },
  COLLECTED: { label: 'Collected', tone: 'bg-surface-2 text-ink-2 ring-line', mark: 'bg-ink-3' },
  REJECTED: { label: 'Rejected', tone: 'bg-danger-tint text-danger ring-danger/20', mark: 'bg-danger' },
  TIMED_OUT: { label: 'Not accepted', tone: 'bg-danger-tint text-danger ring-danger/20', mark: 'bg-danger' },
  CANCELLED: { label: 'Cancelled', tone: 'bg-danger-tint text-danger ring-danger/20', mark: 'bg-danger' },
};

export function StatusPill({ status }: { status: SubOrderStatus }) {
  const s = STATUS[status];
  return (
    <span className={cx('inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ring-1 ring-inset', s.tone)}>
      <span aria-hidden className={cx('h-1.5 w-1.5 rounded-full', s.mark)} />
      {s.label}
    </span>
  );
}
