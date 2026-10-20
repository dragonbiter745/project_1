import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cx } from '@foodcourt/ui';

/**
 * Change against the previous period, always with an arrow and words so it never relies on colour.
 * `goodWhenDown` flips the colour for figures like refunds, where a rise is bad news.
 */
export function Delta({ now, before, label, goodWhenDown }: { now: number; before: number; label: string; goodWhenDown?: boolean }) {
  if (now === before) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-ink-3">
        <Minus className="h-3.5 w-3.5" /> No change {label}
      </span>
    );
  }
  if (before === 0) {
    return <span className="text-sm text-ink-3">Nothing to compare {label}</span>;
  }
  const pct = ((now - before) / Math.abs(before)) * 100;
  const up = pct > 0;
  const good = goodWhenDown ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const shown = Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)).toString() : Math.abs(pct).toFixed(1);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 text-sm">
      <span className={cx('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums', good ? 'bg-ready-tint text-ready' : 'bg-danger-tint text-danger')}>
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
        {up ? '+' : '−'}
        {shown}%
      </span>
      <span className="text-ink-3">{label}</span>
    </span>
  );
}
