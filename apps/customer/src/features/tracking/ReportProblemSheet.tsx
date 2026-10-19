import { useEffect, useId, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { reportIssue } from '../../lib/firebase';
import { cx } from '../../lib/format';
import { notify, notifyError } from '../../lib/toast';

export interface ReportTarget {
  orderId: string;
  subOrderId?: string;
  vendorId?: string;
  vendorName?: string;
}

const REASONS = ['Wrong item', 'Something is missing', 'Taking too long', 'Food quality', 'Something else'] as const;

export function ReportProblemSheet({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const [reason, setReason] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const textId = useId();

  useEffect(() => {
    if (!target) return;
    setReason(null);
    setText('');
  }, [target]);

  const submit = async () => {
    if (!target || !reason) return;
    setSending(true);
    try {
      await reportIssue({
        orderId: target.orderId,
        subOrderId: target.subOrderId,
        vendorId: target.vendorId,
        reason,
        text,
      });
      notify('Report sent', {
        description: `${target.vendorName ?? 'The shop'} and the food court team have been told.`,
      });
      onClose();
    } catch (err: unknown) {
      console.error('reportIssue failed:', err);
      notifyError("Couldn't send your report", { description: 'Check your connection and try again.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title="Report a problem"
      description={target?.vendorName ? `About your ${target.vendorName} order` : undefined}
      footer={
        <Button size="lg" block disabled={!reason} loading={sending} onClick={submit}>
          Send report
        </Button>
      }
    >
      <fieldset>
        <legend className="mb-3 text-sm font-medium text-ink">What went wrong?</legend>
        <div className="space-y-2">
          {REASONS.map((option) => {
            const selected = reason === option;
            return (
              <label
                key={option}
                className={cx(
                  'pressable flex h-12 cursor-pointer items-center gap-3 rounded-field px-4 ring-1 ring-inset transition-colors duration-150',
                  selected ? 'bg-accent-tint text-ink ring-accent-line' : 'bg-surface text-ink-2 ring-line'
                )}
              >
                <input
                  type="radio"
                  name="issue-reason"
                  value={option}
                  checked={selected}
                  onChange={() => setReason(option)}
                  className="h-4 w-4 accent-[rgb(var(--accent-ink))]"
                />
                <span className="text-base font-medium">{option}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 space-y-2">
        <label htmlFor={textId} className="block text-sm font-medium text-ink">
          Anything else? <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <textarea
          id={textId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Tell us what happened"
          className="w-full resize-none rounded-field bg-surface-2 px-3.5 py-3 text-md text-ink outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-accent/50"
        />
      </div>
    </Sheet>
  );
}
