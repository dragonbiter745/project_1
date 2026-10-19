import { ChevronRight } from 'lucide-react';
import { jsonEqual, useLocal } from '../../lib/store';

// Until vendor sign-in exists (PRD FR-V6), the tablet is bound to one shop on first launch.
export function ShopPicker({ onPick }: { onPick: (vendorId: string) => void }) {
  const vendors = useLocal((s) => s.vendors, jsonEqual);
  return (
    <main className="grid min-h-[100dvh] place-items-center px-6 py-12">
      <div className="w-full max-w-lg">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Which kitchen is this?</h1>
        <p className="mt-2 text-base text-ink-3">
          This screen shows orders for the shop you pick. You can change it later from the top bar.
        </p>
        <ul className="mt-8 space-y-3">
          {vendors.map((vendor) => (
            <li key={vendor.id}>
              <button
                type="button"
                onClick={() => onPick(vendor.id)}
                className="pressable hover-surface flex w-full items-center justify-between gap-4 rounded-card bg-surface p-5 text-left ring-1 ring-inset ring-line transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-xl font-semibold text-ink">{vendor.name}</span>
                  <span className="mt-1 block text-sm text-ink-3">
                    Tokens {vendor.code}-001 onward · usual prep {vendor.defaultPrepMin} min
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
