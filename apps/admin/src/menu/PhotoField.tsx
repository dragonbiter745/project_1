import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { uploadShopImage } from '@foodcourt/firebase-client/shop-admin';
import { Button, cx, run } from '@foodcourt/ui';

/** One square photo: tap to add, then change or remove. The picture is shrunk on the phone before it uploads. */
export function PhotoField({ vendorId, value, onChange, label = 'Photo', shape = 'square' }: { vendorId: string; value: string | null; onChange: (url: string | null) => void; label?: string; shape?: 'square' | 'round' }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    await run(uploadShopImage(vendorId, file).then(onChange));
    setBusy(false);
    if (input.current) input.current.value = '';
  };

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-ink">{label}</p>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label={value ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
          className={cx(
            'pressable relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden bg-surface-2 text-ink-3 ring-1 ring-inset ring-line-strong',
            shape === 'round' ? 'rounded-full' : 'rounded-card'
          )}
        >
          {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-7 w-7" strokeWidth={1.8} />}
          {busy && (
            <span className="absolute inset-0 grid place-items-center bg-surface/70">
              <Loader2 className="h-6 w-6 animate-spin text-accent-ink" />
            </span>
          )}
        </button>
        <div className="flex flex-col items-start gap-1">
          <Button size="sm" variant="tint" onClick={() => input.current?.click()} disabled={busy}>
            {value ? 'Change photo' : 'Add photo'}
          </Button>
          {value && (
            <Button size="sm" variant="danger" onClick={() => onChange(null)} disabled={busy} icon={<Trash2 className="h-4 w-4" />}>
              Remove
            </Button>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => void pick(e.target.files?.[0])} />
    </div>
  );
}
