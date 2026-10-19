import { useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Search, SearchX, Store, X } from 'lucide-react';
import { formatDailyCustomerNo } from '@foodcourt/shared';
import { VegDot } from '@foodcourt/ui';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { cleanLabel, cx } from '../../lib/format';
import { jsonEqual, useLocal } from '../../lib/store';
import { useProfile } from '../auth/profileStore';
import type { TableSession } from '../session/useTableSession';
import { useUi } from '../ui/uiStore';
import { ItemRow } from './ItemRow';
import { ShopSwitcher } from './ShopSwitcher';

const NONE_UNAVAILABLE: Record<string, boolean> = {};
let entrancePlayed = false;

export function MenuScreen({ session }: { session: TableSession }) {
  const vendors = useLocal((s) => s.vendors, jsonEqual);
  const [vendorId, setVendorId] = useState(() => vendors[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState('ALL');
  const [query, setQuery] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const [playEntrance] = useState(() => !entrancePlayed);

  useEffect(() => {
    entrancePlayed = true;
  }, []);

  const vendor = vendors.find((v) => v.id === vendorId);
  const menu = useLocal((s) => s.menus[vendorId]);
  const unavailable = useLocal((s) => s.availability[vendorId]?.unavailable ?? NONE_UNAVAILABLE, jsonEqual);
  const paused = vendor ? !vendor.acceptingOrders : false;

  const sections = useMemo(() => {
    if (!menu) return [];
    const q = deferredQuery.trim().toLowerCase();
    return menu.categories
      .filter((cat) => categoryId === 'ALL' || cat.id === categoryId)
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            (!vegOnly || item.veg) &&
            (!q || item.name.toLowerCase().includes(q) || cat.name.toLowerCase().includes(q))
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [menu, categoryId, deferredQuery, vegOnly]);

  const switchVendor = (id: string) => {
    if (id === vendorId) return;
    setVendorId(id);
    setCategoryId('ALL');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const resetFilters = () => {
    setQuery('');
    setVegOnly(false);
    setCategoryId('ALL');
  };

  return (
    <>
      <header className="sticky top-0 z-header border-b border-line/70 bg-bg/85 backdrop-blur-xl backdrop-saturate-150">
        <IdentityRow session={session} />
        <div className="px-4 pb-3">
          <ShopSwitcher vendors={vendors} activeId={vendorId} onChange={switchVendor} />
        </div>
        <div className="flex gap-2 px-4 pb-3">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search {vendor?.name}</span>
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-3"
              strokeWidth={1.75}
            />
            <input
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${vendor?.name ?? 'menu'}`}
              className="h-11 w-full rounded-full bg-surface-2 pl-10 pr-11 text-md text-ink outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-accent/50"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-0 top-0 grid h-11 w-11 place-items-center text-ink-3"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            )}
          </label>
          <button
            type="button"
            aria-pressed={vegOnly}
            onClick={() => setVegOnly((v) => !v)}
            className={cx(
              'pressable inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset transition-colors duration-150',
              vegOnly ? 'bg-ready-tint text-veg ring-veg/40' : 'bg-surface text-ink-2 ring-line'
            )}
          >
            <VegDot veg size="sm" />
            Veg only
          </button>
        </div>
        {menu && (
          <div role="tablist" aria-label="Categories" className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
            <CategoryChip label="All" active={categoryId === 'ALL'} onClick={() => setCategoryId('ALL')} />
            {menu.categories.map((cat) => (
              <CategoryChip
                key={cat.id}
                label={cleanLabel(cat.name)}
                active={categoryId === cat.id}
                onClick={() => setCategoryId(cat.id)}
              />
            ))}
          </div>
        )}
      </header>

      <main className="px-4 pb-44">
        {paused && vendor && (
          <div role="status" className="mt-4 flex items-start gap-3 rounded-card bg-prep-tint p-4 text-sm text-ink-2 ring-1 ring-inset ring-prep/20">
            <Store className="mt-0.5 h-[18px] w-[18px] shrink-0 text-prep" strokeWidth={1.75} />
            <p>
              <span className="font-semibold text-ink">{vendor.name} isn't taking orders right now.</span> You can still
              browse the menu.
            </p>
          </div>
        )}

        {!menu ? (
          <MenuSkeleton />
        ) : sections.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-ink-3">
              <SearchX className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <p className="mt-4 text-base font-semibold text-ink">
              {deferredQuery.trim() ? `Nothing matches “${deferredQuery.trim()}”` : 'Nothing here yet'}
            </p>
            <p className="mt-1 text-sm text-ink-3">Try another dish, or clear the filters.</p>
            <Button variant="outline" className="mt-5" onClick={resetFilters}>
              Clear filters
            </Button>
          </div>
        ) : (
          sections.map((cat, index) => (
            <section
              key={cat.id}
              aria-labelledby={`cat-${cat.id}`}
              className={cx('cv-auto', playEntrance && index < 4 && 'enter-up')}
              style={{ '--i': index } as CSSProperties}
            >
              <div className="flex items-baseline justify-between px-1 pb-2.5 pt-6">
                <h2 id={`cat-${cat.id}`} className="text-lg font-semibold tracking-tight text-ink">
                  {cleanLabel(cat.name)}
                </h2>
                <span className="text-sm tabular-nums text-ink-3">{cat.items.length}</span>
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-inset ring-line/70">
                {cat.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    vendorId={vendorId}
                    soldOut={Boolean(unavailable[item.id])}
                    paused={paused}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
    </>
  );
}

function IdentityRow({ session }: { session: TableSession }) {
  const profile = useProfile((s) => s.profile);
  const show = useUi((s) => s.show);
  return (
    <div className="flex h-16 items-center justify-between gap-3 pl-4 pr-2">
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold tracking-tight text-ink">{profile?.name ?? session.displayName}</p>
        <p className="text-sm tabular-nums text-ink-3">
          {formatDailyCustomerNo(session.dailyNo)} · Table {session.tableLabel}
        </p>
      </div>
      {profile ? (
        <button
          type="button"
          onClick={() => show('account')}
          aria-label="Your account"
          className="pressable grid h-11 w-11 shrink-0 place-items-center"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-tint text-sm font-semibold text-accent-ink ring-1 ring-inset ring-accent-line">
            {profile.name.charAt(0).toUpperCase()}
          </span>
        </button>
      ) : (
        <Button variant="quiet" className="mr-2" onClick={() => show('login')}>
          Sign in
        </Button>
      )}
    </div>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx(
        "relative h-9 shrink-0 rounded-full px-3.5 text-sm font-medium transition-colors duration-150 after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']",
        active ? 'bg-ink text-white' : 'bg-surface text-ink-2 ring-1 ring-inset ring-line'
      )}
    >
      {label}
    </button>
  );
}

function MenuSkeleton() {
  return (
    <div className="pt-6" aria-busy="true" aria-label="Loading menu">
      <Skeleton className="mb-3 h-5 w-40" />
      <div className="divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-inset ring-line/70">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-11 w-[108px] rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
