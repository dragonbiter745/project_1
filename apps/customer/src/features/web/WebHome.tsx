import { useMemo, type CSSProperties } from 'react';
import { ArrowRight, ArrowUpRight, UserRound } from 'lucide-react';
import type { Vendor, VendorMenu } from '@foodcourt/shared';
import { useAuth } from '../../lib/authStore';
import { cx } from '../../lib/format';
import { jsonEqual, useLocal } from '../../lib/store';
import { Avatar } from '../account/Avatar';
import { useProfile } from '../auth/profileStore';
import { useUi } from '../ui/uiStore';
import { Skeleton } from '@foodcourt/ui';

// The story of the court (3D preview, how it works, rewards) lives on the landing page; this site is for ordering.
const LANDING_URL = ((import.meta.env.VITE_LANDING_URL as string | undefined) ?? 'https://reva-nest-landing.web.app').replace(/\/$/, '');

/** The diner site's front door: pick a counter and start ordering. */
export function WebHome({ onOpenShop }: { onOpenShop: (vendorId: string) => void }) {
  const vendors = useLocal((s) => s.vendors, jsonEqual);
  const menus = useLocal((s) => s.menus, jsonEqual);
  const member = useAuth((s) => Boolean(s.user?.member));
  const showLogin = useUi((s) => s.showLogin);

  return (
    <div className="min-h-[100dvh] pb-32">
      <TopBar />

      <main className="mx-auto max-w-6xl px-4 pt-6 md:px-6 md:pt-10">
        <h1 className="enter-up font-display text-[clamp(36px,6vw,64px)] font-extrabold leading-[0.95] text-ink">
          Choose a counter.
        </h1>
        <p className="enter-up mt-2 max-w-md text-md text-ink-2" style={{ '--i': 1 } as CSSProperties}>
          One cart for every shop. Pay once online and collect with your token.
        </p>

        <div className="mt-6 grid gap-3 md:mt-8 md:grid-cols-[1.4fr_1fr]" aria-label="Restaurants">
          {vendors.length === 0
            ? Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-[300px] rounded-[28px]" />)
            : vendors.map((v, i) => <Stall key={v.id} vendor={v} menu={menus[v.id]} index={i} onOpen={() => onOpenShop(v.id)} />)}
        </div>

        {!member && (
          <div className="mt-6 flex flex-col gap-3 rounded-[24px] bg-surface-2 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-base text-ink-2">
              <span className="font-semibold text-ink">Members get more.</span> Member-only coupons, offers and your orders on any phone.
            </p>
            <button
              type="button"
              onClick={() => showLogin(undefined, { mode: 'signup' })}
              className="pressable h-11 shrink-0 rounded-full bg-ink px-5 text-sm font-semibold text-surface"
            >
              Create free account
            </button>
          </div>
        )}
      </main>

      <footer className="mx-auto mt-16 max-w-6xl px-4 text-sm text-ink-3 md:px-6">
        <div className="flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <a href={LANDING_URL} className="font-display text-lg font-bold text-ink hover:text-accent-ink">
            REVA Food Court
          </a>
          <p>Prices include GST. Each shop prepares its own dishes; collect them at its counter.</p>
        </div>
      </footer>
    </div>
  );
}

function TopBar() {
  const user = useAuth((s) => s.user);
  const profile = useProfile((s) => s.profile);
  const show = useUi((s) => s.show);
  const showLogin = useUi((s) => s.showLogin);
  const member = Boolean(user?.member);
  const name = profile?.name || user?.name || 'You';

  return (
    <header className="sticky top-0 z-header border-b border-line/70 bg-bg/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <a href={LANDING_URL} className="font-display text-2xl font-extrabold text-ink" aria-label="REVA Food Court, about the court">
            REVA
          </a>
          <a href={LANDING_URL} className="hidden items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink sm:inline-flex">
            About the court
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} />
          </a>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!member && (
            <button type="button" onClick={() => showLogin()} className="pressable h-10 rounded-full bg-ink px-4 text-sm font-semibold text-surface">
              Sign in
            </button>
          )}
          <button type="button" onClick={() => show('account')} aria-label="Your account" className="pressable grid h-11 w-11 place-items-center">
            {member ? (
              <Avatar name={name} photoURL={user?.photoURL} size={36} />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-ink-2">
                <UserRound className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
}

interface StallProps {
  vendor: Vendor;
  menu: VendorMenu | undefined;
  index: number;
  onOpen: () => void;
}

/** A shop as a counter sign: solid colour, its name in display type, real dishes, and photos once the shop uploads any. */
function Stall({ vendor, menu, index, onOpen }: StallProps) {
  const unavailable = useLocal((s) => s.availability[vendor.id]?.unavailable, jsonEqual);
  const stats = useMemo(() => {
    const items = menu?.categories.flatMap((c) => c.items) ?? [];
    return {
      count: items.length,
      photos: items.filter((i) => i.imageUrl && !unavailable?.[i.id]).slice(0, 3),
      veg: items.length > 0 && items.every((i) => i.veg),
      picks: items.filter((i) => !unavailable?.[i.id]).slice(0, 3),
    };
  }, [menu, unavailable]);
  const open = vendor.acceptingOrders && vendor.status === 'active';

  return (
    <article className={cx('enter-up', `stall-${index % 3}`)} style={{ '--i': index + 2 } as CSSProperties}>
      <button
        type="button"
        onClick={onOpen}
        className="pressable stall-bg group relative flex h-full min-h-[300px] w-full flex-col overflow-hidden rounded-[28px] p-6 text-left md:min-h-[360px] md:p-8"
      >
        {stats.photos.length > 0 && (
          <div className="absolute inset-y-0 right-0 hidden w-[42%] gap-px md:grid" style={{ gridTemplateRows: `repeat(${stats.photos.length}, minmax(0, 1fr))` }} aria-hidden>
            {stats.photos.map((p) => (
              <img key={p.id} src={p.imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            ))}
          </div>
        )}
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-10 right-2 font-display text-[200px] font-extrabold leading-none text-bg/[0.07] transition-transform duration-[var(--dur-slow)] ease-out group-hover:-translate-y-2 md:text-[240px]"
        >
          {initials(vendor.name)}
        </span>
        <div className="relative">
          <span className="inline-flex h-7 items-center rounded-full bg-bg/15 px-3 text-xs font-semibold">{open ? 'Taking orders' : 'Paused right now'}</span>
          <h2 className="mt-5 max-w-[12ch] font-display text-[clamp(34px,4.4vw,58px)] font-bold leading-[0.95]">{vendor.name}</h2>
          <p className="mt-2 text-base text-bg/75">
            About {vendor.defaultPrepMin} min
            {stats.count > 0 && `. ${stats.count} dishes`}
            {stats.veg && '. Pure veg'}
          </p>
        </div>
        {stats.picks.length > 0 && (
          <ul className="relative mt-auto flex max-w-[58%] flex-wrap gap-1.5 pt-8 max-md:max-w-none" aria-label="Some dishes">
            {stats.picks.map((p) => (
              <li key={p.id} className="max-w-full truncate rounded-full px-3 py-1.5 text-sm ring-1 ring-inset ring-bg/30">
                {p.name}
              </li>
            ))}
          </ul>
        )}
        <span className="relative mt-5 inline-flex items-center gap-1.5 text-sm font-semibold">
          View menu
          <ArrowRight className="h-4 w-4 transition-transform duration-[var(--dur-base)] group-hover:translate-x-1" strokeWidth={2.25} />
        </span>
      </button>
    </article>
  );
}
