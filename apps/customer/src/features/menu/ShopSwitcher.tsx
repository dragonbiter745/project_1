import type { CSSProperties } from 'react';
import type { Vendor } from '@foodcourt/shared';

interface ShopSwitcherProps {
  vendors: Vendor[];
  activeId: string;
  onChange: (vendorId: string) => void;
}

// The active label is a clipped copy of the label row, so its colour changes exactly
// where the sliding indicator is instead of fading between two separate states.
export function ShopSwitcher({ vendors, activeId, onChange }: ShopSwitcherProps) {
  const count = vendors.length;
  const index = Math.max(0, vendors.findIndex((v) => v.id === activeId));
  const columns: CSSProperties = { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` };
  const clip = `inset(0 ${((count - 1 - index) * 100) / count}% 0 ${(index * 100) / count}% round 999px)`;

  return (
    <div role="tablist" aria-label="Shops" className="relative grid h-11 rounded-full bg-surface-2 p-1" style={columns}>
      <span
        aria-hidden
        className="seg-indicator absolute inset-y-1 left-1 rounded-full bg-surface shadow-thumb"
        style={{ width: `calc((100% - 8px) / ${count})`, transform: `translateX(${index * 100}%)` }}
      />
      {vendors.map((vendor) => (
        <button
          key={vendor.id}
          type="button"
          role="tab"
          aria-selected={vendor.id === activeId}
          onClick={() => onChange(vendor.id)}
          className="relative truncate px-2 text-sm font-medium text-ink-3"
        >
          {vendor.name}
        </button>
      ))}
      <div
        aria-hidden
        className="seg-active-layer pointer-events-none absolute inset-1 grid"
        style={{ ...columns, clipPath: clip }}
      >
        {vendors.map((vendor) => (
          <span key={vendor.id} className="grid place-items-center truncate px-2 text-sm font-semibold text-ink">
            {vendor.name}
          </span>
        ))}
      </div>
    </div>
  );
}
