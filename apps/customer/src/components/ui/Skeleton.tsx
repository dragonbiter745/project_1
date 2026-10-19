import { cx } from '../../lib/format';

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx('shimmer block rounded-field', className)} />;
}
