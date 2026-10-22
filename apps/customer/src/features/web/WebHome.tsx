import { useMemo, type CSSProperties } from 'react';
import { ArrowRight, QrCode, UserRound } from 'lucide-react';
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
  { verb: 'Pick', text: 'Dishes from any counter go into one cart.' },
  { verb: 'Pay', text: 'Once, online. Each shop gives you its own token.' },
  { verb: 'Collect', text: 'Live updates tell you when each dish is up.' },
];

const SECTIONS = [
  ['restaurants', 'Restaurants'],
  ['rewards', 'Rewards'],
  ['how', 'How it works'],
] as const;

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/** The website's front page: the court's counters as stalls, member rewards and how pickup works. */
export function WebHome({ onOpenShop }: { onOpenShop: (vendorId: string) => void }) {
  const vendors = useLocal((s) => s.vendors, jsonEqual);
  const menus = useLocal((s) => s.menus, jsonEqual);

  return (
    <div className="min-h-[100dvh] pb-32">
      <TopBar />

      <section className="mx-auto max-w-6xl px-4 pt-8 md:px-6 md:pt-14">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <h1 className="enter-up font-display text-[clamp(48px,8.5vw,120px)] font-extrabold leading-[0.9] text-ink">
            Every counter.
            <br />
            <span className="text-accent">One cart.</span>
          </h1>
          <div className="enter-up max-w-xs md:pb-3" style={{ '--i': 1 } as CSSProperties}>
            <p className="text-md text-ink-2">Order ahead from the whole food court, pay once, collect with your token.</p>
            <button
              type="button"
              onClick={() => scrollTo('restaurants')}
              className="pressable mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-base font-semibold text-on-accent"
            >
              Browse restaurants
              <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <div id="restaurants" className="mt-8 grid scroll-mt-20 gap-3 md:mt-12 md:grid-cols-[1.4fr_1fr]" aria-label="Restaurants">
          {vendors.length === 0
            ? Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-[300px] rounded-[28px]" />)
            : vendors.map((v, i) => <Stall key={v.id} vendor={v} menu={menus[v.id]} index={i} onOpen={() => onOpenShop(v.id)} />)}
        </div>
      </section>

      <Rewards />
      <HowItWorks />

      <footer className="mx-auto mt-20 max-w-6xl px-4 text-sm text-ink-3 md:px-6">
        <div className="flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display text-lg font-bold text-ink">REVA Food Court</p>
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
        <a href="/" className="font-display text-2xl font-extrabold text-ink" aria-label="REVA Food Court home">
          REVA
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

function Rewards() {
  const member = useAuth((s) => Boolean(s.user?.member));
  const showLogin = useUi((s) => s.showLogin);
  const show = useUi((s) => s.show);

  return (
    <section id="rewards" aria-labelledby="rewards-title" className="mx-auto mt-20 max-w-6xl scroll-mt-20 px-4 md:mt-28 md:px-6">
      <div className="grid gap-10 border-t-2 border-ink pt-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <h2 id="rewards-title" className="font-display text-[clamp(36px,5vw,64px)] font-extrabold leading-[0.95] text-ink">
            Members get more.
          </h2>
          <p className="mt-4 max-w-sm text-md text-ink-2">A free account keeps your orders together and unlocks offers guests don't see.</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {member ? (
              <button type="button" onClick={() => show('account')} className="pressable inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-base font-semibold text-surface">
                See your coupons
                <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
              </button>
            ) : (
              <>
                <button type="button" onClick={() => showLogin(undefined, { mode: 'signup' })} className="pressable h-12 rounded-full bg-ink px-6 text-base font-semibold text-surface">
                  Create free account
                </button>
                <button
                  type="button"
                  onClick={() => showLogin(undefined, { mode: 'login' })}
                  className="pressable h-12 rounded-full px-5 text-base font-semibold text-ink ring-1 ring-inset ring-line-strong hover-surface"
                >
                  Log in
                </button>
              </>
            )}
          </div>
          <p className="mt-5 max-w-sm text-xs text-ink-3">Coupons and offers depend on what the court and its shops run. Loyalty points are not live yet.</p>
        </div>
        <dl className="grid gap-x-8 sm:grid-cols-2">
          {PERKS.map(({ icon: Icon, title, text, soon }) => (
            <div key={title} className="flex gap-4 border-b border-line py-5">
              <Icon className="mt-0.5 h-6 w-6 shrink-0 text-accent-ink" strokeWidth={1.5} />
              <div>
                <dt className="text-base font-semibold text-ink">
                  {title}
                  {soon && <SoonTag />}
                </dt>
                <dd className="mt-1 text-sm text-ink-3">{text}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="mt-20 scroll-mt-20 bg-surface-2 py-14 md:mt-28 md:py-20">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <h2 id="how-title" className="max-w-xl font-display text-[clamp(30px,4vw,48px)] font-bold leading-tight text-ink">
          Order ahead, skip the queue.
        </h2>
        <p className="mt-3 text-base text-ink-3">Ordering online needs a free account and online payment.</p>
        <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-10">
          {STEPS.map(({ verb, text }) => (
            <li key={verb}>
              <p className="font-display text-[44px] font-extrabold leading-none text-accent">{verb}</p>
              <p className="mt-3 max-w-[28ch] text-base text-ink-2">{text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-12 flex items-start gap-4 border-t border-line-strong/60 pt-6">
          <QrCode className="mt-0.5 h-6 w-6 shrink-0 text-ink" strokeWidth={1.5} />
          <p className="text-base text-ink-2">
            <span className="font-semibold text-ink">Already at the court?</span> Scan the QR on your table to order from your seat. Guests can order there
            without an account.
          </p>
        </div>
      </div>
    </section>
  );
}
