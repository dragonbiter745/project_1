import { useEffect, useState } from 'react';
import { formatPaise, type SubOrder } from '@foodcourt/shared';
import { Button, Sheet, cx } from '@foodcourt/ui';

const REASONS = ['Shop cannot fulfil it', 'Diner asked to cancel', 'Duplicate order', 'Payment problem'] as const;

export function CancelSheet({
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
      title={sub ? `Cancel ${sub.token}?` : 'Cancel order'}
      description={
        sub ? `${sub.vendorName ?? 'The shop'} stops this ticket and ${formatPaise(sub.subtotalPaise)} is refunded to the diner.` : undefined
      }
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
            className="bg-danger-tint ring-1 ring-inset ring-danger/30"
          >
            Cancel and refund
          </Button>
        </div>
      }
    >
      <fieldset>
        <legend className="mb-3 text-sm font-medium text-ink">Reason (recorded and shown to the diner)</legend>
        <div className="space-y-2">
          {REASONS.map((option) => (
            <label
              key={option}
              className={cx(
                'pressable flex h-12 cursor-pointer items-center gap-3 rounded-field px-4 ring-1 ring-inset transition-colors duration-150',
                reason === option ? 'bg-danger-tint text-ink ring-danger/40' : 'bg-surface text-ink-2 ring-line'
              )}
            >
              <input
                type="radio"
                name="cancel-reason"
                checked={reason === option}
                onChange={() => setReason(option)}
                className="h-4 w-4 accent-[rgb(var(--danger))]"
              />
              <span className="text-base font-medium">{option}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </Sheet>
  );
}
