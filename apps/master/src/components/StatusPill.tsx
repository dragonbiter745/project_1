import type { SubOrderStatus } from '@foodcourt/shared';
import { cx } from '@foodcourt/ui';

const STATUS: Record<SubOrderStatus, { label: string; tone: string }> = {
  NEW: { label: 'New', tone: 'bg-accent-tint text-accent-ink' },
  ACCEPTED: { label: 'Cooking', tone: 'bg-prep-tint text-prep' },
  PREPARING: { label: 'Cooking', tone: 'bg-prep-tint text-prep' },
  READY: { label: 'Ready', tone: 'bg-ready-tint text-ready' },
  COLLECTED: { label: 'Collected', tone: 'bg-surface-2 text-ink-2' },
  REJECTED: { label: 'Rejected', tone: 'bg-danger-tint text-danger' },
  TIMED_OUT: { label: 'Not accepted', tone: 'bg-danger-tint text-danger' },
  CANCELLED: { label: 'Cancelled', tone: 'bg-danger-tint text-danger' },
};

export function StatusPill({ status }: { status: SubOrderStatus }) {
  const s = STATUS[status];
  return (
    <span className={cx('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold', s.tone)}>{s.label}</span>
  );
}
