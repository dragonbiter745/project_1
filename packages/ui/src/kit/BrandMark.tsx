import { cx } from './utils';
import { QRAVE_MARK } from './brandAsset';

const SIZES = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-16 w-16',
} as const;

// The Qrave mark: an orange ring with a charcoal square, with no tile behind it. The same mark in every app.
export function BrandMark({ size = 'md', className }: { size?: keyof typeof SIZES; className?: string }) {
  return <img src={QRAVE_MARK} alt="" aria-hidden draggable={false} className={cx('shrink-0 select-none object-contain', SIZES[size], className)} />;
}
