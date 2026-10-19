import { useDeferredValue, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Search, SearchX, X } from 'lucide-react';
import { Button, lockScroll, unlockScroll, useBackDismiss, VegDot } from '@foodcourt/ui';
import { cx, pluralize } from '../../lib/format';
import { jsonEqual, useLocal } from '../../lib/store';
import { ItemRow } from '../menu/ItemRow';
import { searchMenu } from './searchMenu';

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  vegOnly: boolean;
  onVegToggle: () => void;
}

const SUGGESTIONS = ['Biriyani', 'Dosa', 'Paneer', 'Noodles', 'Rolls', 'Lassi'];
const EXIT_MS = 180;

// Rendered synchronously when opened (see MenuScreen) so the input can take focus inside
// the tap handler; iOS only raises the keyboard for focus that happens in a user gesture.
export function SearchOverlay({ open, onClose, inputRef, vegOnly, onVegToggle }: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const vendors = useLocal((s) => s.vendors, jsonEqual);
  const menus = useLocal((s) => s.menus);
  const availability = useLocal((s) => s.availability, jsonEqual);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const wasOpen = useRef(false);

  useBackDismiss(open, onClose);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      setExiting(false);
      const frame = requestAnimationFrame(() => setVisible(true));
      lockScroll();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onCloseRef.current();
      };
      window.addEventListener('keydown', onKey);
      return () => {
        cancelAnimationFrame(frame);
        unlockScroll();
        window.removeEventListener('keydown', onKey);
      };
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    setVisible(false);
    setExiting(true);
    const t = setTimeout(() => {
      setExiting(false);
      setQuery('');
    }, EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  const groups = useMemo(
    () =>
      vendors
        .map((vendor) => {
          const menu = menus[vendor.id];
          return { vendor, hits: menu ? searchMenu(menu, deferredQuery, vegOnly) : [] };
        })
        .filter((g) => g.hits.length > 0),
    [vendors, menus, deferredQuery, vegOnly]
  );

  if (!open && !exiting) return null;

  const trimmed = deferredQuery.trim();
  const total = groups.reduce((n, g) => n + g.hits.length, 0);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search all shops"
      data-visible={visible}
      className="search-overlay fixed inset-0 z-search flex flex-col bg-bg"
    >
      <div className="mx-auto w-full max-w-md shrink-0 border-b border-line/70 px-3 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-1">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search dishes in every shop</span>
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-3"
              strokeWidth={1.75}
            />
            <input
              ref={inputRef}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search dishes in every shop"
              className="h-11 w-full rounded-full bg-surface-2 pl-10 pr-11 text-md text-ink outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-accent/50"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-0 top-0 grid h-11 w-11 place-items-center text-ink-3"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            )}
          </label>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-2 px-1">
          <button
            type="button"
            aria-pressed={vegOnly}
            onClick={onVegToggle}
            className={cx(
              "pressable relative inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset transition-colors duration-150 after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']",
              vegOnly ? 'bg-ready-tint text-veg ring-veg/40' : 'bg-surface text-ink-2 ring-line'
            )}
          >
            <VegDot veg size="sm" />
            Veg only
          </button>
          {trimmed && (
            <span className="text-sm text-ink-3" aria-live="polite">
              {pluralize(total, 'result')}
            </span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-md px-4 pb-40">
          {!trimmed ? (
            <div className="pt-6">
              <p className="text-sm font-medium text-ink-3">Try</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {SUGGESTIONS.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setQuery(term)}
                    className="pressable h-11 rounded-full bg-surface px-4 text-sm font-medium text-ink ring-1 ring-inset ring-line"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          ) : groups.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-ink-3">
                <SearchX className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <p className="mt-4 text-base font-semibold text-ink">Nothing matches “{trimmed}”</p>
              <p className="mt-1 text-sm text-ink-3">
                {vegOnly ? 'Veg only is on. Turn it off to see every dish.' : 'Check the spelling or try a shorter word.'}
              </p>
            </div>
          ) : (
            groups.map(({ vendor, hits }) => (
              <section key={vendor.id} aria-label={vendor.name}>
                <div className="flex items-baseline justify-between px-1 pb-2.5 pt-6">
                  <h2 className="text-lg font-semibold tracking-tight text-ink">{vendor.name}</h2>
                  <span className="text-sm tabular-nums text-ink-3">{hits.length}</span>
                </div>
                <ul className="divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-inset ring-line/70">
                  {hits.map(({ item }) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      vendorId={vendor.id}
                      soldOut={Boolean(availability[vendor.id]?.unavailable[item.id])}
                      paused={!vendor.acceptingOrders}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
