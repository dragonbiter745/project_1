import { UtensilsCrossed } from 'lucide-react';
import { cx } from './utils';

const SIZES = {
  sm: 'h-9 w-9 rounded-[11px] [&_svg]:h-[18px] [&_svg]:w-[18px]',
  md: 'h-11 w-11 rounded-[13px] [&_svg]:h-5 [&_svg]:w-5',
  lg: 'h-16 w-16 rounded-[18px] [&_svg]:h-7 [&_svg]:w-7',
} as const;

// Saffron squircle with a soft top highlight; the one place the brand colour is used as a fill.
export function BrandMark({ size = 'md', className }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'brand-mark relative grid shrink-0 place-items-center bg-accent-ink text-on-accent shadow-card',
        SIZES[size],
        className
      )}
    >
      <UtensilsCrossed strokeWidth={2} />
    </span>
  );
}
