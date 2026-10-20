import { useEffect, useState } from 'react';
import { recordPayout } from '@foodcourt/firebase-client/finance';
import { formatPaise, getIstDateKey, type ShopFinance } from '@foodcourt/shared';
import { Button, Sheet } from '@foodcourt/ui';
import { Field, FormError, inputClass, parseRupees } from './Field';

interface PayoutSheetProps {
  open: boolean;
  shops: ShopFinance[];
  vendorId?: string;
  onClose: () => void;
  onSaved: () => void;
}

const newKey = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 32);

/** Logs money already sent to a shop by bank transfer or UPI. The court pays outside this app; this is the record. */
export function PayoutSheet({ open, shops, vendorId, onClose, onSaved }: PayoutSheetProps) {
  const today = getIstDateKey();
  const [shop, setShop] = useState('');
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // One key per opening of the form: a double tap or a retry after a timeout records the payout once.
  const [requestKey, setRequestKey] = useState(newKey);

  useEffect(() => {
    if (!open) return;
    const pick = vendorId ?? shops[0]?.vendorId ?? '';
    const due = shops.find((s) => s.vendorId === pick)?.balanceDuePaise ?? 0;
    setShop(pick);
    setAmount(due > 0 ? (due / 100).toFixed(2).replace(/\.00$/, '') : '');
    setPaidOn(getIstDateKey());
    setReference('');
    setNote('');
    setError('');
    setRequestKey(newKey());
  }, [open, vendorId, shops]);

  const selected = shops.find((s) => s.vendorId === shop);
  const amountPaise = parseRupees(amount);

  const save = async () => {
    if (!selected) return setError('Pick a shop.');
    if (!amountPaise || amountPaise < 100) return setError('Enter the amount you sent, at least ₹1.');
    if (reference.trim().length < 3) return setError('Enter the bank UTR or UPI reference so this payout can be traced.');
    setBusy(true);
    setError('');
    try {
      await recordPayout({ requestKey, vendorId: selected.vendorId, amountPaise, paidOn, reference: reference.trim(), ...(note.trim() ? { note: note.trim() } : {}) });
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const over = selected && amountPaise !== null && amountPaise > Math.max(0, selected.balanceDuePaise);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Record a payout"
      description="Log money you have already sent to a shop. It comes off what the court owes them."
      footer={
        <Button variant="accent" size="lg" block loading={busy} onClick={() => void save()}>
          Save payout{amountPaise ? ` of ${formatPaise(amountPaise, true)}` : ''}
        </Button>
      }
    >
      <div className="space-y-4 px-5 pb-2">
        <Field label="Shop">
          {(id) => (
            <select id={id} value={shop} onChange={(e) => setShop(e.target.value)} className={inputClass}>
              {shops.map((s) => (
                <option key={s.vendorId} value={s.vendorId}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        {selected && (
          <p className="flex justify-between rounded-field bg-accent-tint px-3.5 py-3 text-sm ring-1 ring-inset ring-accent-line">
            <span className="text-ink-2">Court still owes {selected.name}</span>
            <span className="font-semibold tabular-nums text-ink">{formatPaise(Math.max(0, selected.balanceDuePaise), true)}</span>
          </p>
        )}
        <Field label="Amount sent (₹)" hint={over ? 'This is more than the balance due. Save it only if you paid in advance.' : undefined}>
          {(id) => <input id={id} inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={`${inputClass} tabular-nums`} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid on">
            {(id) => <input id={id} type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value || today)} className={inputClass} />}
          </Field>
          <Field label="UTR or UPI ref">
            {(id) => <input id={id} autoComplete="off" value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 4127 9930 1180" className={inputClass} />}
          </Field>
        </div>
        <Field label="Note (optional)">
          {(id) => <input id={id} autoComplete="off" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Week of 13 Oct" className={inputClass} />}
        </Field>
        <FormError text={error} />
      </div>
    </Sheet>
  );
}
