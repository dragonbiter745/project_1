import { ChevronRight } from 'lucide-react';
import { BrandMark, Monogram } from '@foodcourt/ui';
import { jsonEqual, useLocal } from '../../lib/store';

// Until vendor sign-in exists (PRD FR-V6), the tablet is bound to one shop on first launch.
export function ShopPicker({ onPick }: { onPick: (vendorId: string) => void }) {
  const vendors = useLocal((s) => s.vendors, jsonEqual);
  return (
    <main className="grain ambient grid min-h-[100dvh] place-items-center px-6 py-12">
      <div className="enter-up w-full max-w-xl">
        <div className="flex items-center gap-3">
          <BrandMark />
          <p className="text-sm font-semibold text-ink-2">REVA Food Court · Kitchen display</p>
        </div>
        <h1 className="mt-8 text-4xl font-semibold tracking-tight text-ink [text-wrap:balance]">Which kitchen is this screen for?</h1>
        <p className="mt-3 max-w-[52ch] text-base text-ink-3">
          It will show live orders for the shop you pick. You can switch later from the top bar.
        </p>
        <ul className="mt-10 space-y-3">
          {vendors.map((vendor, i) => (
            <li key={vendor.id} className="enter-up" style={{ ['--i' as string]: i + 1 }}>
              <button
                type="button"
                onClick={() => onPick(vendor.id)}
                className="pressable group flex w-full items-center gap-4 rounded-sheet bg-surface p-5 text-left shadow-card ring-1 ring-inset ring-line/70 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:ring-accent-line"
              >
                <Monogram code={vendor.code} size="lg" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xl font-semibold tracking-tight text-ink">{vendor.name}</span>
                  <span className="mt-1 block text-sm text-ink-3">
                    Tokens {vendor.code}-001 onward · usual prep {vendor.defaultPrepMin} min
                  </span>
                </span>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3 transition-colors group-hover:bg-accent-tint group-hover:text-accent-ink">
                  <ChevronRight className="h-5 w-5" strokeWidth={2} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
