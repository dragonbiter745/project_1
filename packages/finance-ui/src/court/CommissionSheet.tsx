import { useEffect, useState } from 'react';
import { setCommission } from '@foodcourt/firebase-client/finance';
import { MAX_COMMISSION_PCT, commissionFor, formatPaise, type ShopFinance } from '@foodcourt/shared';
import { Button, Sheet } from '@foodcourt/ui';
import { Field, FormError, inputClass, parseRupees } from '../components/Field';

/** The court's cut of a shop's sales. New rates apply to orders placed after saving; past orders keep theirs. */
export function CommissionSheet({ shop, onClose, onSaved }: { shop: ShopFinance | null; onClose: () => void; onSaved: () => void }) {
  const [pct, setPct] = useState('');
  const [flat, setFlat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!shop) return;
    setPct(String(shop.feePct));
    setFlat(shop.perOrderFeePaise ? (shop.perOrderFeePaise / 100).toString() : '0');
    setError('');
  }, [shop]);

  const feePct = /^\d{1,2}(\.\d{1,2})?$/.test(pct.trim()) ? Number(pct) : null;
  const perOrder = parseRupees(flat || '0');
  const example = feePct !== null && perOrder !== null ? commissionFor(20_000, { feePct, perOrderFeePaise: perOrder }) : null;

  const save = async () => {
    if (!shop) return;
    if (feePct === null || feePct > MAX_COMMISSION_PCT) return setError(`Enter a percentage from 0 to ${MAX_COMMISSION_PCT}.`);
    if (perOrder === null || perOrder > 10_000) return setError('The per-order fee must be between ₹0 and ₹100.');
    setBusy(true);
    setError('');
    try {
      await setCommission(shop.vendorId, feePct, perOrder);
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={shop !== null}
      onClose={onClose}
      title={shop ? `Commission for ${shop.name}` : ''}
      description="Applies to orders placed from now on. Earlier orders keep the rate they were placed at."
      footer={
        <Button variant="accent" size="lg" block loading={busy} onClick={() => void save()}>
          Save rate
        </Button>
      }
    >
      <div className="space-y-4 px-5 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Share of sales (%)">
            {(id) => <input id={id} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} className={`${inputClass} tabular-nums`} />}
          </Field>
          <Field label="Per order (₹)">
            {(id) => <input id={id} inputMode="decimal" value={flat} onChange={(e) => setFlat(e.target.value)} className={`${inputClass} tabular-nums`} />}
          </Field>
        </div>
        {example !== null && (
          <p className="rounded-field bg-surface-2 px-3.5 py-3 text-sm text-ink-2">
            On a ₹200 order the court keeps <span className="font-semibold text-ink">{formatPaise(example, true)}</span> and the shop gets{' '}
            <span className="font-semibold text-ink">{formatPaise(20_000 - example, true)}</span>.
          </p>
        )}
        <FormError text={error} />
      </div>
    </Sheet>
  );
}
