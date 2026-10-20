import { useEffect, useState } from 'react';
import { voidEntry } from '@foodcourt/firebase-client/finance';
import { formatPaise, type FounderEntry } from '@foodcourt/shared';
import { Button, Sheet } from '@foodcourt/ui';
import { Field, FormError, inputClass } from '../components/Field';
import { formatDay } from '../lib/range';

/** Entries are never deleted: a wrong one is voided with a reason and stays visible, struck through. */
export function VoidEntrySheet({ entry, onClose, onDone }: { entry: FounderEntry | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setReason('');
    setError('');
  }, [entry]);

  const confirm = async () => {
    if (!entry) return;
    if (reason.trim().length < 3) return setError('Say why, so the other founders understand.');
    setBusy(true);
    try {
      await voidEntry(entry.id, reason.trim());
      onDone();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={entry !== null}
      onClose={onClose}
      title="Void this entry?"
      description={entry ? `${formatPaise(entry.amountPaise, true)} on ${formatDay(entry.date)}${entry.note ? ` · ${entry.note}` : ''}. It stays in the books, marked void, and stops counting.` : undefined}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="ink" size="lg" loading={busy} onClick={() => void confirm()} className="bg-danger">
            Void entry
          </Button>
        </div>
      }
    >
      <div className="space-y-3 px-5 pb-2">
        <Field label="Reason">
          {(id) => <input id={id} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice" className={inputClass} />}
        </Field>
        <FormError text={error} />
      </div>
    </Sheet>
  );
}
