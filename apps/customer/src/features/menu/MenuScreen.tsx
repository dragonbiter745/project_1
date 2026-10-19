import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { Store, UtensilsCrossed } from 'lucide-react';
import { formatDailyCustomerNo } from '@foodcourt/shared';
import { cleanLabel, cx } from '../../lib/format';
import { jsonEqual, useLocal } from '../../lib/store';
import { useProfile } from '../auth/profileStore';
import { SearchOverlay } from '../search/SearchOverlay';
import type { TableSession } from '../session/useTableSession';
import { useUi } from '../ui/uiStore';
import { CategoryRail } from './CategoryRail';
import { ItemRow } from './ItemRow';
import { ShopSwitcher } from './ShopSwitcher';
import { MENU_END_ID, sectionDomId, useScrollSpy } from './useScrollSpy';
import { Button, Skeleton } from '@foodcourt/ui';

const NONE_UNAVAILABLE: Record<string, boolean> = {};
let entrancePlayed = false;

export function MenuScreen({ session }: { session: TableSession }) {
  const vendors = useLocal((s) => s.vendors, jsonEqual);
  const [vendorId, setVendorId] = useState(() => vendors[0]?.id ?? '');
  const [vegOnly, setVegOnly] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [playEntrance] = useState(() => !entrancePlayed);
  const identityRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    entrancePlayed = true;
  }, []);

  // Section jumps land just below the sticky header, whatever height it renders at.
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const apply = () =>
      document.documentElement.style.setProperty('--sticky-h', `${header.getBoundingClientRect().height}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const vendor = vendors.find((v) => v.id === vendorId);
  const menu = useLocal((s) => s.menus[vendorId]);
  const unavailable = useLocal((s) => s.availability[vendorId]?.unavailable ?? NONE_UNAVAILABLE, jsonEqual);
  const paused = vendor ? !vendor.acceptingOrders : false;

  const sections = useMemo(
    () =>
      menu
        ? menu.categories
            .map((cat) => ({ ...cat, items: vegOnly ? cat.items.filter((i) => i.veg) : cat.items }))
            .filter((cat) => cat.items.length > 0)
        : [],
    [menu, vegOnly]
  );
  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const { active, jumpTo } = useScrollSpy(sectionIds);

  const switchVendor = (id: string) => {
    if (id === vendorId) return;
    setVendorId(id);
    // Keep the header pinned if it already is; otherwise leave the page where it is.
    const pinnedAt = identityRef.current?.offsetHeight ?? 0;
    if (window.scrollY > pinnedAt) window.scrollTo({ top: pinnedAt, behavior: 'instant' });
  };

  const openSearch = () => {
    flushSync(() => setSearchOpen(true));
    searchInputRef.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <IdentityRow ref={identityRef} session={session} />

      <header
        ref={headerRef}
        className="sticky top-0 z-header border-b border-line/70 bg-bg/85 pt-2 backdrop-blur-xl backdrop-saturate-150"
      >
        <div className="px-4 pb-3">
          <ShopSwitcher vendors={vendors} activeId={vendorId} onChange={switchVendor} />
        </div>
        {menu && (
          <CategoryRail
            categories={sections}
            activeId={active}
            onSelect={jumpTo}
            vegOnly={vegOnly}
            onVegToggle={() => setVegOnly((v) => !v)}
            onSearch={openSearch}
          />
        )}
      </header>

      <main className="px-4 pb-44">
        {paused && vendor && (
          <div
            role="status"
            className="mt-4 flex items-start gap-3 rounded-card bg-prep-tint p-4 text-sm text-ink-2 ring-1 ring-inset ring-prep/20"
          >
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
              <UtensilsCrossed className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <p className="mt-4 text-base font-semibold text-ink">No vegetarian dishes at {vendor?.name}</p>
            <p className="mt-1 text-sm text-ink-3">Turn off Veg to see everything on the menu.</p>
            <Button variant="outline" className="mt-5" onClick={() => setVegOnly(false)}>
              Show all dishes
            </Button>
          </div>
        ) : (
          sections.map((cat, index) => (
            <section
              key={cat.id}
              id={sectionDomId(cat.id)}
              aria-labelledby={`cat-${cat.id}`}
              className={cx('scroll-mt-[calc(var(--sticky-h)+4px)]', playEntrance && index < 4 && 'enter-up')}
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
        <div id={MENU_END_ID} aria-hidden className="h-px" />
      </main>

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        inputRef={searchInputRef}
        vegOnly={vegOnly}
        onVegToggle={() => setVegOnly((v) => !v)}
      />
    </>
  );
}

function IdentityRow({ session, ref }: { session: TableSession; ref: React.Ref<HTMLDivElement> }) {
  const profile = useProfile((s) => s.profile);
  const show = useUi((s) => s.show);
  return (
    <div ref={ref} className="flex h-16 items-center justify-between gap-3 pl-4 pr-2 pt-1">
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
