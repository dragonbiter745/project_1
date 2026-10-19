import { useEffect, useState } from 'react';
import { formatPaise, type SubOrder } from '@foodcourt/shared';
import { Button, Sheet, cx } from '@foodcourt/ui';

const REASONS = ['Out of ingredients', 'Kitchen too busy right now', 'Closing for the day', 'Item not available'] as const;

export function RejectSheet({
  sub,
  onClose,
  onConfirm,
}: {
  sub: SubOrder | null;
  onClose: () => void;
  onConfirm: (sub: SubOrder, reason: string) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (sub) setReason(null);
  }, [sub]);

  return (
    <Sheet
      open={sub !== null}
      onClose={onClose}
      title={sub ? `Reject ${sub.token}?` : 'Reject order'}
      description={sub ? `The diner is refunded ${formatPaise(sub.subtotalPaise)} automatically.` : undefined}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" onClick={onClose}>
            Keep order
          </Button>
          <Button
            variant="danger"
            size="lg"
            disabled={!reason}
            onClick={() => sub && reason && onConfirm(sub, reason)}
            className="bg-danger-tint ring-1 ring-inset ring-danger/40"
          >
            Reject and refund
          </Button>
        </div>
      }
    >
      <fieldset>
        <legend className="mb-3 text-sm font-medium text-ink">Reason (shown to the diner)</legend>
        <div className="space-y-2">
          {REASONS.map((option) => {
            const selected = reason === option;
            return (
              <label
                key={option}
                className={cx(
                  'pressable flex h-14 cursor-pointer items-center gap-3 rounded-field px-4 ring-1 ring-inset transition-colors duration-150',
                  selected ? 'bg-danger-tint text-ink ring-danger/50' : 'bg-surface-2 text-ink-2 ring-line'
                )}
              >
                <input
                  type="radio"
                  name="reject-reason"
                  checked={selected}
                  onChange={() => setReason(option)}
                  className="h-4 w-4 accent-[rgb(var(--danger))]"
                />
                <span className="text-md font-medium">{option}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </Sheet>
  );
}
