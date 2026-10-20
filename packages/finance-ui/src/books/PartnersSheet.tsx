import { useEffect, useState } from 'react';
import { setPartners } from '@foodcourt/firebase-client/finance';
import type { Partner } from '@foodcourt/shared';
import { Button, Sheet, cx } from '@foodcourt/ui';
import { FormError, inputClass } from '../components/Field';

/** Founder names and profit shares. Shares are typed as percentages and stored in basis points. */
export function PartnersSheet({ open, partners, onClose, onSaved }: { open: boolean; partners: Partner[]; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<Array<{ id: string; name: string; pct: string }>>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRows(partners.map((p) => ({ id: p.id, name: p.name, pct: (p.shareBps / 100).toString() })));
    setError('');
  }, [open, partners]);

  const bps = rows.map((r) => (/^\d{1,3}(\.\d{1,2})?$/.test(r.pct.trim()) ? Math.round(Number(r.pct) * 100) : NaN));
  const total = bps.reduce((n, b) => n + (Number.isNaN(b) ? 0 : b), 0);

  const save = async () => {
    if (rows.some((r) => r.name.trim().length < 2)) return setError('Enter every founder name.');
    if (bps.some(Number.isNaN)) return setError('Shares must be numbers like 33.34.');
    if (total !== 10_000) return setError(`Shares add up to ${total / 100}%. They must add up to exactly 100%.`);
    setBusy(true);
    try {
      await setPartners(rows.map((r, i) => ({ id: r.id, name: r.name.trim(), shareBps: bps[i]! })));
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const edit = (i: number, patch: Partial<{ name: string; pct: string }>) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Founders and shares"
      description="How profit is split between the founders. Changing shares re-splits every report, past ones included."
      footer={
        <Button variant="accent" size="lg" block loading={busy} onClick={() => void save()}>
          Save shares
        </Button>
      }
    >
      <div className="space-y-3 px-5 pb-2">
        {rows.map((r, i) => (
          <div key={r.id} className="grid grid-cols-[1fr_110px] gap-2">
            <input aria-label={`Founder ${i + 1} name`} value={r.name} maxLength={60} onChange={(e) => edit(i, { name: e.target.value })} className={inputClass} />
            <div className="relative">
              <input aria-label={`${r.name} share in percent`} inputMode="decimal" value={r.pct} onChange={(e) => edit(i, { pct: e.target.value })} className={`${inputClass} pr-8 text-right tabular-nums`} />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-3">%</span>
            </div>
          </div>
        ))}
        <p className={cx('text-right text-sm font-semibold tabular-nums', total === 10_000 ? 'text-ready' : 'text-danger')}>Total {total / 100}%</p>
        <FormError text={error} />
      </div>
    </Sheet>
  );
}
