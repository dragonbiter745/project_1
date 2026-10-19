import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { cx } from './utils';

const OPTIONS: Array<{ label: string; minutes: number | null }> = [
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: 'Until I resume', minutes: null },
];

export function PauseSheet({
  shopName,
  open,
  onClose,
  onPause,
}: {
  shopName: string;
  open: boolean;
  onClose: () => void;
  onPause: (until: number | null) => void;
}) {
  const [choice, setChoice] = useState(0);

  useEffect(() => {
    if (open) setChoice(0);
  }, [open]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Pause new orders?"
      description={`Diners can still browse ${shopName}, but can't order until you resume. Orders already placed stay on the board.`}
      footer={
        <Button
          variant="accent"
          size="lg"
          block
          onClick={() => {
            const minutes = OPTIONS[choice]?.minutes ?? null;
            onPause(minutes === null ? null : Date.now() + minutes * 60_000);
          }}
        >
          Pause orders
        </Button>
      }
    >
      <div role="radiogroup" aria-label="Pause for" className="grid grid-cols-2 gap-2">
        {OPTIONS.map((option, i) => (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={choice === i}
            onClick={() => setChoice(i)}
            className={cx(
              'pressable h-16 rounded-card px-4 text-md font-semibold ring-1 ring-inset transition-colors duration-150',
              choice === i ? 'bg-accent-tint text-ink ring-accent-line' : 'bg-surface-2 text-ink-2 ring-line'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
