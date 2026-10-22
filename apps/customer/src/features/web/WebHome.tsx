import { useMemo, type CSSProperties } from 'react';
import { ArrowRight, Clock3, QrCode, ShoppingBag, UserRound, Wallet } from 'lucide-react';
import type { Vendor, VendorMenu } from '@foodcourt/shared';
import { useAuth } from '../../lib/authStore';
import { cx } from '../../lib/format';
import { jsonEqual, useLocal } from '../../lib/store';
import { Avatar } from '../account/Avatar';
import { PERKS, SoonTag } from '../auth/perks';
import { useProfile } from '../auth/profileStore';
import { useUi } from '../ui/uiStore';
import { Skeleton } from '@foodcourt/ui';

const STEPS = [
  { icon: ShoppingBag, title: 'Pick from any shop', text: 'One cart for every counter in the court.' },
  { icon: Wallet, title: 'Pay once online', text: 'UPI, cards or netbanking. You get a token for each shop.' },
  { icon: Clock3, title: 'Collect when ready', text: 'Live updates tell you the moment your food is up.' },
];

const SECTIONS = [
  ['restaurants', 'Restaurants'],
  ['rewards', 'Rewards'],
  ['how', 'How it works'],
] as const;

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/** The website's front page: the court, its restaurants, member rewards and how pickup works. */
export function WebHome({ onOpenShop }: { onOpenShop: (vendorId: string) => void }) {
  const vendors = useLocal((s) => s.vendors, jsonEqual);
  const menus = useLocal((s) => s.menus, jsonEqual);

  return (
    <div className="min-h-[100dvh] pb-32">
      <TopBar />
      <Hero onBrowse={() => scrollTo('restaurants')} onHow={() => scrollTo('how')} />

      <section id="restaurants" aria-labelledby="restaurants-title" className="mx-auto mt-14 max-w-6xl scroll-mt-20 px-4 md:mt-20 md:px-6">
        <SectionHead
          eyebrow="Restaurants"
          id="restaurants-title"
          title="Choose a shop to start"
          text="Menus are live: prices, sold-out dishes and paused counters update as you browse."
        />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vendors.length === 0
            ? Array.from({ length: 3 }, (_, i) => <ShopSkeleton key={i} />)
            : vendors.map((v, i) => <ShopCard key={v.id} vendor={v} menu={menus[v.id]} index={i} onOpen={() => onOpenShop(v.id)} />)}
        </div>
      </section>

      <Rewards />
      <HowItWorks />

      <footer className="mx-auto mt-16 max-w-6xl px-4 text-sm text-ink-3 md:px-6">
        <div className="flex flex-col gap-2 border-t border-line-strong/70 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-semibold text-ink">REVA Food Court</p>
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
    <header className="sticky top-0 z-header border-b border-line/70 bg-bg/85 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
        <a href="/" className="flex min-w-0 items-center gap-2.5" aria-label="REVA Food Court home">
          <BrandGlyph />
          <span className="truncate text-lg font-semibold tracking-tight text-ink">REVA Food Court</span>
        </a>
        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {SECTIONS.map(([id, label]) => (
            <button key={id} type="button" onClick={() => scrollTo(id)} className="pressable h-10 rounded-full px-3.5 text-sm font-medium text-ink-2 hover-surface">
              {label}
            </button>
          ))}
        </nav>
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
              <span className="grid h-9 w-9 place-items-center rounded-full bg-surface text-ink-2 ring-1 ring-inset ring-line">
                <UserRound className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

function BrandGlyph() {
  return (
    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-ink">
      <svg viewBox="0 0 64 64" className="h-6 w-6">
        <path d="M22 16v14a6 6 0 0 0 4 5.7V48h4V35.7a6 6 0 0 0 4-5.7V16h-3v12h-2V16h-2v12h-2V16zm20 0c-3.3 0-6 4.5-6 12 0 4 2 6 4 6.6V48h4V16z" fill="rgb(var(--accent))" />
      </svg>
    </span>
  );
}

function Hero({ onBrowse, onHow }: { onBrowse: () => void; onHow: () => void }) {
  return (
    <section className="mx-auto mt-4 max-w-6xl px-4 md:mt-6 md:px-6">
      <div className="relative overflow-hidden rounded-[28px] bg-ink text-surface shadow-float">
        <span aria-hidden className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-accent/55 blur-3xl" />
        <span aria-hidden className="absolute -bottom-40 left-1/3 h-72 w-72 rounded-full bg-bg/10 blur-3xl" />
        <div className="relative grid gap-10 px-6 py-10 md:grid-cols-[1.25fr_1fr] md:items-center md:px-12 md:py-16">
          <div className="enter-up">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">REVA University · Food Court</p>
            <h1 className="mt-4 text-[clamp(36px,7vw,64px)] font-semibold leading-[1.02] tracking-tight">
              Every shop at REVA.
              <br />
              <span className="text-accent">One order.</span>
            </h1>
            <p className="mt-5 max-w-md text-md text-surface/75">
              Order ahead from every counter in one cart, pay once, and pick up with your token. At a table? Scan its QR to order
              from your seat.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={onBrowse} className="pressable inline-flex h-[52px] items-center gap-2 rounded-full bg-accent px-6 text-md font-semibold text-ink">
                Browse restaurants
                <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.25} />
              </button>
              <button
                type="button"
                onClick={onHow}
                className="pressable inline-flex h-[52px] items-center rounded-full px-6 text-md font-semibold text-surface ring-1 ring-inset ring-surface/30 hover:bg-surface/10"
              >
                How pickup works
              </button>
            </div>
          </div>
          <TokenPreview />
        </div>
      </div>
    </section>
  );
}

/** An illustration of the tracking screen, marked as an example so it never reads as a real order. */
function TokenPreview() {
  const rows = [
    { shop: 'Shop one', token: 'A-042', status: 'Ready to collect', tone: 'bg-ready-tint text-ready' },
    { shop: 'Shop two', token: 'B-017', status: 'Preparing', tone: 'bg-prep-tint text-prep' },
  ];
  return (
    <div aria-hidden className="enter-up relative mx-auto w-full max-w-sm md:ml-auto" style={{ '--i': 2 } as CSSProperties}>
      <div className="rotate-[-2deg] rounded-[22px] bg-surface p-5 text-ink shadow-float">
        <div className="flex items-center justify-between">
          <p className="text-lg font-semibold tracking-tight">Your order</p>
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.1em] text-ink-3">Example</span>
        </div>
        <p className="mt-0.5 text-sm text-ink-3">Pickup at the counter</p>
        <ul className="mt-4 space-y-2.5">
          {rows.map((r) => (
            <li key={r.token} className="flex items-center justify-between gap-3 rounded-card bg-bg/70 px-4 py-3">
              <span>
                <span className="block text-sm text-ink-3">{r.shop}</span>
                <span className="block font-mono text-2xl font-semibold tracking-tight">{r.token}</span>
              </span>
              <span className={cx('rounded-full px-2.5 py-1 text-xs font-semibold', r.tone)}>{r.status}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface SectionHeadProps {
  eyebrow: string;
  title: string;
  text: string;
  id: string;
  tone?: 'light' | 'dark';
}

function SectionHead({ eyebrow, title, text, id, tone = 'light' }: SectionHeadProps) {
  const dark = tone === 'dark';
  return (
    <div className="max-w-2xl">
      <p className={cx('text-xs font-semibold uppercase tracking-[0.16em]', dark ? 'text-accent' : 'text-ink-3')}>{eyebrow}</p>
      <h2 id={id} className={cx('mt-2 text-[clamp(26px,4vw,36px)] font-semibold leading-tight tracking-tight', dark ? 'text-surface' : 'text-ink')}>
        {title}
      </h2>
      <p className={cx('mt-2 text-base', dark ? 'text-surface/75' : 'text-ink-3')}>{text}</p>
    </div>
  );
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
}

interface ShopCardProps {
  vendor: Vendor;
  menu: VendorMenu | undefined;
  index: number;
  onOpen: () => void;
}

function ShopCard({ vendor, menu, index, onOpen }: ShopCardProps) {
  const unavailable = useLocal((s) => s.availability[vendor.id]?.unavailable, jsonEqual);
  const stats = useMemo(() => {
    const items = menu?.categories.flatMap((c) => c.items) ?? [];
    return {
      count: items.length,
      photos: items.filter((i) => i.imageUrl).slice(0, 3),
      veg: items.length > 0 && items.every((i) => i.veg),
      picks: items.filter((i) => !unavailable?.[i.id]).slice(0, 3),
    };
  }, [menu, unavailable]);
  const open = vendor.acceptingOrders && vendor.status === 'active';

  return (
    <article className="enter-up" style={{ '--i': index } as CSSProperties}>
      <button
        type="button"
        onClick={onOpen}
        className="pressable group flex h-full w-full flex-col overflow-hidden rounded-[22px] bg-surface text-left shadow-card ring-1 ring-inset ring-line/70 transition-shadow duration-200 hover:shadow-float"
      >
        <div className="relative h-36 overflow-hidden bg-ink">
          {stats.photos.length > 0 ? (
            <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${stats.photos.length}, minmax(0, 1fr))` }}>
              {stats.photos.map((p) => (
                <img key={p.id} src={p.imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ))}
            </div>
          ) : (
            <>
              <span aria-hidden className="absolute -right-10 -top-16 h-44 w-44 rounded-full bg-accent/60 blur-2xl" />
              <span aria-hidden className="absolute bottom-3 left-5 text-[64px] font-semibold leading-none tracking-tight text-surface/90">
                {initials(vendor.name)}
              </span>
            </>
          )}
          <span className={cx('absolute right-3 top-3 inline-flex h-7 items-center gap-1.5 rounded-full bg-surface px-2.5 text-xs font-semibold', open ? 'text-ready' : 'text-prep')}>
            <span className={cx('h-1.5 w-1.5 rounded-full', open ? 'bg-ready' : 'bg-prep')} aria-hidden />
            {open ? 'Taking orders' : 'Paused'}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-5">
          <h3 className="text-xl font-semibold tracking-tight text-ink">{vendor.name}</h3>
          <p className="mt-1 text-sm text-ink-3">
            About {vendor.defaultPrepMin} min
            {stats.count > 0 && ` · ${stats.count} dishes`}
            {stats.veg && ' · Pure veg'}
          </p>
          {stats.picks.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Some dishes">
              {stats.picks.map((p) => (
                <li key={p.id} className="max-w-full truncate rounded-full bg-bg px-2.5 py-1 text-xs font-medium text-ink-2">
                  {p.name}
                </li>
              ))}
            </ul>
          )}
          <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-ink">
            View menu
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2.25} />
          </span>
        </div>
      </button>
    </article>
  );
}

function ShopSkeleton() {
  return (
    <div className="overflow-hidden rounded-[22px] bg-surface ring-1 ring-inset ring-line/70" aria-busy="true" aria-label="Loading restaurants">
      <Skeleton className="h-36 rounded-none" />
      <div className="space-y-3 p-5">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-7 w-3/4" />
      </div>
    </div>
  );
}

function Rewards() {
  const member = useAuth((s) => Boolean(s.user?.member));
  const showLogin = useUi((s) => s.showLogin);
  const show = useUi((s) => s.show);

  return (
    <section id="rewards" aria-labelledby="rewards-title" className="mx-auto mt-16 max-w-6xl scroll-mt-20 px-4 md:mt-24 md:px-6">
      <div className="relative overflow-hidden rounded-[28px] bg-ink px-6 py-10 md:px-12 md:py-14">
        <span aria-hidden className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-accent/35 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-start">
          <div>
            <SectionHead
              tone="dark"
              eyebrow="Rewards"
              id="rewards-title"
              title="Members get more"
              text="A free REVA account keeps your orders together and unlocks offers that guests don't see."
            />
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {member ? (
                <button type="button" onClick={() => show('account')} className="pressable inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-base font-semibold text-ink">
                  See your coupons
                  <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => showLogin(undefined, { mode: 'signup' })} className="pressable h-12 rounded-full bg-accent px-6 text-base font-semibold text-ink">
                    Create free account
                  </button>
                  <button
                    type="button"
                    onClick={() => showLogin(undefined, { mode: 'login' })}
                    className="pressable h-12 rounded-full px-5 text-base font-semibold text-surface ring-1 ring-inset ring-surface/30 hover:bg-surface/10"
                  >
                    Log in
                  </button>
                </>
              )}
            </div>
            <p className="mt-5 max-w-sm text-xs text-surface/60">
              Coupons and offers depend on what the court and its shops run. Loyalty points are not live yet.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PERKS.map(({ icon: Icon, title, text, soon }, i) => (
              <li key={title} className="enter-up rounded-card bg-surface/[0.07] p-5 ring-1 ring-inset ring-surface/15" style={{ '--i': i } as CSSProperties}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-ink">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <p className="mt-4 text-base font-semibold text-surface">
                  {title}
                  {soon && <SoonTag />}
                </p>
                <p className="mt-1 text-sm text-surface/70">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="mx-auto mt-16 max-w-6xl scroll-mt-20 px-4 md:mt-24 md:px-6">
      <SectionHead eyebrow="How it works" id="how-title" title="Order ahead, skip the queue" text="Ordering online needs a free account and online payment." />
      <ol className="mt-6 grid gap-3 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="rounded-card bg-surface p-5 ring-1 ring-inset ring-line/70">
            <div className="flex items-center justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-accent-tint text-accent-ink ring-1 ring-inset ring-accent-line">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <span className="font-mono text-sm font-semibold text-ink-3">0{i + 1}</span>
            </div>
            <p className="mt-4 text-base font-semibold text-ink">{title}</p>
            <p className="mt-1 text-sm text-ink-3">{text}</p>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-col gap-4 rounded-card bg-surface p-5 ring-1 ring-inset ring-line/70 sm:flex-row sm:items-center">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink text-accent">
          <QrCode className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="text-base font-semibold text-ink">Already at the court?</p>
          <p className="text-sm text-ink-3">Scan the QR on your table to order from your seat. Guests can order there without an account.</p>
        </div>
      </div>
    </section>
  );
}
