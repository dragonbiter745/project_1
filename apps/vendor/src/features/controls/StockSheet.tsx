import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { formatPaise } from '@foodcourt/shared';
import { Sheet, cx } from '@foodcourt/ui';
import { setItemAvailable } from '@foodcourt/firebase-client/local-ops';
import { jsonEqual, useLocal } from '../../lib/store';

const NONE: Record<string, boolean> = {};
const cleanLabel = (name: string) => name.replace(/^[^\p{L}\p{N}]+/u, '').trim();

export function StockSheet({ vendorId, open, onClose }: { vendorId: string; open: boolean; onClose: () => void }) {
  const menu = useLocal((s) => s.menus[vendorId]);
  const unavailable = useLocal((s) => s.availability[vendorId]?.unavailable ?? NONE, jsonEqual);
  const [query, setQuery] = useState('');
  const [soldOutOnly, setSoldOutOnly] = useState(false);
  const soldOutCount = Object.keys(unavailable).length;

  const sections = useMemo(() => {
    if (!menu) return [];
    const q = query.trim().toLowerCase();
    return menu.categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) => (!q || item.name.toLowerCase().includes(q)) && (!soldOutOnly || unavailable[item.id])
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [menu, query, soldOutOnly, unavailable]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Stock"
      description="Switch a dish off when it runs out. Diners see it as sold out instantly."
    >
      <div className="sticky top-0 z-[1] -mx-5 space-y-3 bg-surface px-5 pb-3">
        <label className="relative block">
          <span className="sr-only">Find a dish</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-3" strokeWidth={1.75} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a dish"
            className="h-12 w-full rounded-full bg-surface-2 pl-10 pr-4 text-md text-ink outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-accent/50"
          />
        </label>
        <button
          type="button"
          aria-pressed={soldOutOnly}
          onClick={() => setSoldOutOnly((v) => !v)}
          className={cx(
            'pressable inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium ring-1 ring-inset transition-colors',
            soldOutOnly ? 'bg-danger-tint text-danger ring-danger/40' : 'bg-surface text-ink-2 ring-line'
          )}
        >
          Sold out only
          <span className="font-mono tabular-nums">{soldOutCount}</span>
        </button>
      </div>

      {sections.length === 0 ? (
        <p className="py-12 text-center text-sm text-ink-3">
          {soldOutOnly ? 'Everything is in stock.' : 'No dish matches that search.'}
        </p>
      ) : (
        sections.map((cat) => (
          <section key={cat.id} aria-label={cleanLabel(cat.name)} className="pt-4">
            <h3 className="px-1 pb-2 text-sm font-semibold text-ink-3">{cleanLabel(cat.name)}</h3>
            <ul className="divide-y divide-line overflow-hidden rounded-card bg-surface-2/50 ring-1 ring-inset ring-line">
              {cat.items.map((item) => {
                const available = !unavailable[item.id];
                return (
                  <li key={item.id} className="flex items-center gap-3 py-1 pl-4 pr-1">
                    <div className="min-w-0 flex-1">
                      <p className={cx('text-md font-medium [overflow-wrap:anywhere]', available ? 'text-ink' : 'text-ink-3 line-through')}>
                        {item.name}
                      </p>
                      <p className="text-sm tabular-nums text-ink-3">{formatPaise(item.pricePaise)}</p>
                    </div>
                    <StockSwitch
                      label={item.name}
                      checked={available}
                      onChange={(next) => setItemAvailable(vendorId, item.id, next)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </Sheet>
  );
}

function StockSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label} in stock`}
      onClick={() => onChange(!checked)}
      className="grid h-12 w-16 shrink-0 place-items-center"
    >
      <span
        className={cx(
          'relative block h-7 w-12 rounded-full transition-colors duration-200',
          checked ? 'bg-ready' : 'bg-line-strong'
        )}
      >
        <span
          className="switch-thumb absolute left-0.5 top-0.5 block h-6 w-6 rounded-full bg-surface shadow-thumb"
          style={{ transform: checked ? 'translateX(20px)' : undefined }}
        />
      </span>
    </button>
  );
}
