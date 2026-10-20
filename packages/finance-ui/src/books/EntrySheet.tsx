import { useEffect, useState } from 'react';
import { recordEntry, type EntryInput } from '@foodcourt/firebase-client/finance';
import { EXPENSE_CATEGORIES, formatPaise, getIstDateKey, type ExpenseCategory, type Partner } from '@foodcourt/shared';
import { Button, Sheet, cx } from '@foodcourt/ui';
import { Field, FormError, inputClass, parseRupees } from '../components/Field';

export type EntryKind = EntryInput['kind'];

const TITLE: Record<EntryKind, { title: string; description: string; cta: string }> = {
  EXPENSE: { title: 'Add an expense', description: 'Anything the startup spent money on. Takes ten seconds.', cta: 'Save expense' },
  CAPITAL: { title: 'Record an investment', description: 'Money a founder put into the startup.', cta: 'Save investment' },
  DRAWING: { title: 'Record a withdrawal', description: 'Money a founder took out of the startup, for example a profit share.', cta: 'Save withdrawal' },
};

const newKey = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 32);

export function EntrySheet({ kind, partners, onClose, onSaved }: { kind: EntryKind | null; partners: Partner[]; onClose: () => void; onSaved: () => void }) {
  const today = getIstDateKey();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [who, setWho] = useState('court');
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // One key per opening of the form: a double tap or a retry records the entry once.
  const [requestKey, setRequestKey] = useState(newKey);

  useEffect(() => {
    if (!kind) return;
    setAmount('');
    setDate(getIstDateKey());
    setCategory('other');
    setWho(kind === 'EXPENSE' ? 'court' : partners[0]?.id ?? '');
    setNote('');
    setReference('');
    setError('');
    setRequestKey(newKey());
  }, [kind, partners]);

  const paise = parseRupees(amount);
  const save = async () => {
    if (!kind) return;
    if (!paise || paise < 100) return setError('Enter the amount, at least ₹1.');
    if (kind === 'EXPENSE' && !note.trim()) return setError('Say what it was for, e.g. "QR stickers for 155 tables".');
    setBusy(true);
    setError('');
    try {
      await recordEntry(requestKey, {
        kind,
        amountPaise: paise,
        date,
        ...(kind === 'EXPENSE' ? { category, paidBy: who } : { partnerId: who }),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = kind ? TITLE[kind] : TITLE.EXPENSE;
  const people = kind === 'EXPENSE' ? [{ id: 'court', name: 'Startup account' }, ...partners] : partners;

  return (
    <Sheet
      open={kind !== null}
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      footer={
        <Button variant="accent" size="lg" block loading={busy} onClick={() => void save()}>
          {copy.cta}
          {paise ? ` · ${formatPaise(paise, true)}` : ''}
        </Button>
      }
    >
      <div className="space-y-4 px-5 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)">
            {(id) => <input id={id} inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={`${inputClass} tabular-nums`} />}
          </Field>
          <Field label="Date">
            {(id) => <input id={id} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} className={inputClass} />}
          </Field>
        </div>
        <Field label={kind === 'EXPENSE' ? 'What was it for?' : 'Note (optional)'}>
          {(id) => (
            <input
              id={id}
              autoComplete="off"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder={kind === 'EXPENSE' ? 'e.g. QR stickers for 155 tables' : 'e.g. Seed money'}
              className={inputClass}
            />
          )}
        </Field>
        {kind === 'EXPENSE' && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink">Category</legend>
            <div className="flex flex-wrap gap-1.5">
              {EXPENSE_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={category === c.key}
                  onClick={() => setCategory(c.key)}
                  className={cx(
                    'h-9 rounded-full px-3 text-sm font-medium ring-1 ring-inset transition-colors',
                    category === c.key ? 'bg-accent-tint text-accent-ink ring-accent-line' : 'bg-surface text-ink-2 ring-line hover:bg-surface-2'
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">{kind === 'EXPENSE' ? 'Who paid?' : 'Which founder?'}</legend>
          <div className="flex flex-wrap gap-1.5">
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={who === p.id}
                onClick={() => setWho(p.id)}
                className={cx(
                  'h-9 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset transition-colors',
                  who === p.id ? 'bg-ink text-surface ring-ink' : 'bg-surface text-ink-2 ring-line hover:bg-surface-2'
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
          {kind === 'EXPENSE' && who !== 'court' && <p className="mt-1.5 text-xs text-ink-3">Paid from a founder's own pocket counts as money they put in.</p>}
        </fieldset>
        <Field label="Bill, UTR or UPI reference (optional)">
          {(id) => <input id={id} autoComplete="off" value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} className={inputClass} />}
        </Field>
        <FormError text={error} />
      </div>
    </Sheet>
  );
}
