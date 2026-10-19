import { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { VegDot } from '@foodcourt/ui';
import { cleanLabel, cx, prefersReducedMotion } from '../../lib/format';

interface CategoryRailProps {
  categories: Array<{ id: string; name: string }>;
  activeId: string;
  onSelect: (id: string) => void;
  vegOnly: boolean;
  onVegToggle: () => void;
  onSearch: () => void;
}

const chipBase =
  "pressable relative h-9 shrink-0 rounded-full px-3.5 text-sm font-medium transition-colors duration-150 after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']";

export function CategoryRail({ categories, activeId, onSelect, vegOnly, onVegToggle, onSearch }: CategoryRailProps) {
  const railRef = useRef<HTMLDivElement>(null);

  // Keep the active chip centred as the diner scrolls through sections.
  useEffect(() => {
    const rail = railRef.current;
    const chip = rail?.querySelector<HTMLElement>(`[data-cat="${CSS.escape(activeId)}"]`);
    if (!rail || !chip) return;
    rail.scrollTo({
      left: chip.offsetLeft - (rail.clientWidth - chip.offsetWidth) / 2,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [activeId]);

  return (
    <nav
      ref={railRef}
      aria-label="Menu sections"
      className="no-scrollbar relative flex items-center gap-2 overflow-x-auto px-4 pb-3"
    >
      {/* Pinned to the rail's left edge so search stays one tap away mid-scroll. */}
      <span className="sticky -left-4 z-[1] -ml-4 flex shrink-0 items-center self-stretch bg-bg pl-4 pr-1 after:pointer-events-none after:absolute after:inset-y-0 after:-right-3 after:w-3 after:bg-gradient-to-r after:from-bg after:to-transparent after:content-['']">
        <button
          type="button"
          onClick={onSearch}
          aria-label="Search all shops"
          className={cx(chipBase, 'grid w-9 place-items-center bg-accent-tint px-0 text-accent-ink ring-1 ring-inset ring-accent-line')}
        >
          <Search className="h-4 w-4" strokeWidth={2} />
        </button>
      </span>
      <button
        type="button"
        aria-pressed={vegOnly}
        onClick={onVegToggle}
        className={cx(
          chipBase,
          'inline-flex items-center gap-1.5 ring-1 ring-inset',
          vegOnly ? 'bg-ready-tint text-veg ring-veg/40' : 'bg-surface text-ink-2 ring-line'
        )}
      >
        <VegDot veg size="sm" />
        Veg
      </button>
      <span aria-hidden className="h-5 w-px shrink-0 bg-line-strong" />
      {categories.map((cat) => {
        const active = cat.id === activeId;
        return (
          <button
            key={cat.id}
            type="button"
            data-cat={cat.id}
            aria-current={active ? 'true' : undefined}
            onClick={() => onSelect(cat.id)}
            className={cx(chipBase, active ? 'bg-ink text-white' : 'bg-surface text-ink-2 ring-1 ring-inset ring-line')}
          >
            {cleanLabel(cat.name)}
          </button>
        );
      })}
    </nav>
  );
}
