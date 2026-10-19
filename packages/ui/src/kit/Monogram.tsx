import { cx } from './utils';

const SIZES = {
  sm: 'h-8 w-8 rounded-[10px] text-xs',
  md: 'h-11 w-11 rounded-[13px] text-sm',
  lg: 'h-14 w-14 rounded-[16px] text-lg',
} as const;

// Shop identity tile: the shop code on a tinted squircle (RM, SV).
export function Monogram({
  code,
  size = 'md',
  tone = 'tint',
  className,
}: {
  code: string;
  size?: keyof typeof SIZES;
  tone?: 'tint' | 'solid';
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cx(
        'grid shrink-0 place-items-center font-mono font-semibold tracking-tight',
        tone === 'solid'
          ? 'bg-accent-ink text-on-accent shadow-card'
          : 'bg-accent-tint text-accent-ink ring-1 ring-inset ring-accent-line',
        SIZES[size],
        className
      )}
    >
      {code.slice(0, 2).toUpperCase()}
    </span>
  );
}
