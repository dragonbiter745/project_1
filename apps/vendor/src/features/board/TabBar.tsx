import type { RefObject } from 'react';
import { SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { cx } from '@foodcourt/ui';

export interface TabItem<K extends string> {
  key: K;
  label: string;
  Icon: LucideIcon;
  count: number;
  tone: string;
}

interface TabBarProps<K extends string> {
  items: Array<TabItem<K>>;
  active: K;
  onSelect: (key: K) => void;
  onMore: () => void;
  moreAlert: boolean;
  // The board moves this pill straight from the column scroll position, so it tracks the finger.
  indicatorRef: RefObject<HTMLSpanElement | null>;
}

export function TabBar<K extends string>({ items, active, onSelect, onMore, moreAlert, indicatorRef }: TabBarProps<K>) {
  return (
    <nav aria-label="Order columns" className="relative z-header shrink-0 border-t border-line/70 bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="relative grid grid-cols-4 p-1.5">
        <span ref={indicatorRef} aria-hidden className="tab-indicator pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc((100%-12px)/4)] p-0.5">
          <span className="block h-full rounded-[16px] bg-accent-tint ring-1 ring-inset ring-accent-line" />
        </span>
        {items.map(({ key, label, Icon, count, tone }) => {
          const selected = key === active;
          return (
            <button
              key={key}
              type="button"
              aria-current={selected ? 'true' : undefined}
              aria-label={`${label}, ${count} ${count === 1 ? 'order' : 'orders'}`}
              onClick={() => onSelect(key)}
              className={cx(
                'pressable relative flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors duration-200',
                selected ? 'text-accent-ink' : 'text-ink-3'
              )}
            >
              <span className="relative">
                <Icon className="h-[22px] w-[22px]" strokeWidth={2} />
                {count > 0 && (
                  <span
                    key={count}
                    className={cx(
                      'tick absolute -right-3.5 -top-2 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 font-mono text-[11px] font-semibold tabular-nums ring-2 ring-surface',
                      tone
                    )}
                  >
                    {count}
                  </span>
                )}
              </span>
              {label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          className="pressable relative flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-ink-3"
        >
          <span className="relative">
            <SlidersHorizontal className="h-[22px] w-[22px]" strokeWidth={2} />
            {moreAlert && <span className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-surface" />}
          </span>
          More
        </button>
      </div>
    </nav>
  );
}
