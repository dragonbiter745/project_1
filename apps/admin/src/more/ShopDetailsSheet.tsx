import { useState } from 'react';
import { Field, FormError, inputClass } from '@foodcourt/finance-ui';
import { deleteShopImage, shopAdmin } from '@foodcourt/firebase-client/shop-admin';
import type { Vendor } from '@foodcourt/shared';
import { Button, Sheet, cx, run } from '@foodcourt/ui';
import { PhotoField } from '../menu/PhotoField';

/** Logo, opening hours, how long dishes usually take, and pickup or table service. */
export function ShopDetailsSheet({ open, onClose, vendor, seq }: { open: boolean; onClose: () => void; vendor: Vendor; seq: number }) {
  return (
    <Sheet open={open} onClose={onClose} title="Shop details" description="What diners see about your shop">
      <DetailsForm key={seq} vendor={vendor} onDone={onClose} />
    </Sheet>
  );
}

const MODES = [
  { key: 'pickup', label: 'Pickup', hint: 'Diners collect from the counter' },
  { key: 'table_service', label: 'To the table', hint: 'You bring it to their table' },
] as const;

function DetailsForm({ vendor, onDone }: { vendor: Vendor; onDone: () => void }) {
  const [logo, setLogo] = useState<string | null>(vendor.logoUrl ?? null);
  const [open, setOpen] = useState(vendor.hours?.open ?? '09:00');
  const [close, setClose] = useState(vendor.hours?.close ?? '22:00');
  const [prep, setPrep] = useState(String(vendor.defaultPrepMin ?? 10));
  const [mode, setMode] = useState<Vendor['fulfilmentMode']>(vendor.fulfilmentMode ?? 'pickup');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const defaultPrepMin = Number(prep);
    if (!open || !close) return setError('Choose opening and closing time.');
    if (open === close) return setError('Opening and closing time cannot be the same.');
    if (!Number.isInteger(defaultPrepMin) || defaultPrepMin < 1 || defaultPrepMin > 120) return setError('Preparation time must be between 1 and 120 minutes.');
    setError('');
    setSaving(true);
    const ok = await run(shopAdmin({ action: 'UPDATE_SETTINGS', open, close, defaultPrepMin, fulfilmentMode: mode, logoUrl: logo }));
    setSaving(false);
    if (ok) {
      if (vendor.logoUrl && vendor.logoUrl !== logo) void deleteShopImage(vendor.logoUrl);
      onDone();
    }
  };

  return (
    <form
      className="space-y-4 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <PhotoField vendorId={vendor.id} value={logo} onChange={setLogo} label="Shop logo" shape="round" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opens at">{(id) => <input id={id} type="time" className={inputClass} value={open} onChange={(e) => setOpen(e.target.value)} />}</Field>
        <Field label="Closes at">{(id) => <input id={id} type="time" className={inputClass} value={close} onChange={(e) => setClose(e.target.value)} />}</Field>
      </div>
      <Field label="Usual preparation time (minutes)" hint="Shown to diners as the wait. You can still change it per order from the kitchen screen.">
        {(id) => <input id={id} className={inputClass} inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value.replace(/\D/g, '').slice(0, 3))} />}
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink">How diners get their food</legend>
        <div className="grid gap-2">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={mode === m.key}
              onClick={() => setMode(m.key)}
              className={cx('pressable rounded-field px-4 py-3 text-left ring-1 ring-inset transition-colors', mode === m.key ? 'bg-accent-tint ring-accent-line' : 'bg-surface ring-line-strong')}
            >
              <span className={cx('block text-base font-semibold', mode === m.key ? 'text-accent-ink' : 'text-ink')}>{m.label}</span>
              <span className="block text-sm text-ink-3">{m.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <FormError text={error} />
      <Button type="submit" variant="accent" size="lg" block loading={saving}>
        Save
      </Button>
    </form>
  );
}
