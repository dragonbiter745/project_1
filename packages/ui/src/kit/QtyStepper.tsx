import { Minus, Plus } from 'lucide-react';
import { cx } from './utils';

interface QtyStepperProps {
  qty: number;
  itemName: string;
  onIncrement: () => void;
  onDecrement: () => void;
  tone?: 'accent' | 'outline';
  className?: string;
}

export function QtyStepper({ qty, itemName, onIncrement, onDecrement, tone = 'accent', className }: QtyStepperProps) {
  const toneClass =
    tone === 'accent' ? 'bg-accent-ink text-white' : 'bg-surface text-ink ring-1 ring-inset ring-line-strong';
  return (
    <div className={cx('flex h-11 items-center justify-between rounded-full', toneClass, className)}>
      <button
        type="button"
        onClick={onDecrement}
        aria-label={qty === 1 ? `Remove ${itemName}` : `Remove one ${itemName}`}
        className="pressable grid h-11 w-11 place-items-center rounded-full"
      >
        <Minus className="h-4 w-4" strokeWidth={2.25} />
      </button>
      <span className="min-w-[1.25rem] overflow-hidden text-center text-base font-semibold tabular-nums" aria-live="polite">
        <span key={qty} className="tick inline-block">
          {qty}
        </span>
      </span>
      <button
        type="button"
        onClick={onIncrement}
        aria-label={`Add one more ${itemName}`}
        className="pressable grid h-11 w-11 place-items-center rounded-full"
      >
        <Plus className="h-4 w-4" strokeWidth={2.25} />
      </button>
    </div>
  );
}
