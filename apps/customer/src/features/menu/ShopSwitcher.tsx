import { useEffect, useRef, type CSSProperties } from 'react';
import type { Vendor } from '@foodcourt/shared';
import { cx, prefersReducedMotion } from '../../lib/format';

interface ShopSwitcherProps {
  vendors: Vendor[];
  activeId: string;
  onChange: (vendorId: string) => void;
}

// Up to this many shops fit side by side as one sliding pill; more scroll sideways as chips.
const PILL_MAX = 3;

/** Many shops: a row of chips that scrolls sideways and keeps the chosen shop in view. */
function ShopChips({ vendors, activeId, onChange }: ShopSwitcherProps) {
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [activeId]);
  return (
    <div role="tablist" aria-label="Shops" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {vendors.map((vendor) => {
        const on = vendor.id === activeId;
        return (
          <button
            key={vendor.id}
            ref={on ? active : undefined}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(vendor.id)}
            className={cx(
              'h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-sm ring-1 ring-inset transition-colors',
              on ? 'bg-ink font-semibold text-surface ring-ink' : 'bg-surface font-medium text-ink-3 ring-line'
            )}
          >
            {vendor.name}
          </button>
        );
      })}
    </div>
  );
}

// The active label is a clipped copy of the label row, so its colour changes exactly
// where the sliding indicator is instead of fading between two separate states.
export function ShopSwitcher({ vendors, activeId, onChange }: ShopSwitcherProps) {
  const count = vendors.length;
  if (count > PILL_MAX) return <ShopChips vendors={vendors} activeId={activeId} onChange={onChange} />;
  const index = Math.max(0, vendors.findIndex((v) => v.id === activeId));
  const columns: CSSProperties = { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` };
  const clip = `inset(0 ${((count - 1 - index) * 100) / count}% 0 ${(index * 100) / count}% round 999px)`;

  return (
    <div role="tablist" aria-label="Shops" className="relative grid h-11 rounded-full bg-surface p-1 ring-1 ring-inset ring-line" style={columns}>
      <span
        aria-hidden
        className="seg-indicator absolute inset-y-1 left-1 rounded-full bg-ink shadow-thumb"
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
          <span key={vendor.id} className="grid place-items-center truncate px-2 text-sm font-semibold text-surface">
            {vendor.name}
          </span>
        ))}
      </div>
    </div>
  );
}
