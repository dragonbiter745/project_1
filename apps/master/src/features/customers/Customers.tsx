import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarClock, Crown, Megaphone, RefreshCw, Search, ShieldCheck, UserRoundX, Users, X } from 'lucide-react';
import { MESSAGE_TO_KEY } from '../messages/Messages';
import {
  customerTags,
  formatPaise,
  maskPhone,
  placeName,
  type CustomerInsights,
  type CustomerRecord,
  type CustomerSegment,
  type CustomerTag,
  type Order,
} from '@foodcourt/shared';
import { Button, cx } from '@foodcourt/ui';
import { customerOrders, findCustomers, getCustomerInsights, listCustomers, type CustomerPage } from '@foodcourt/firebase-client/customers';
import { ShareBars } from '../../components/Charts';
import { KpiTile } from '../../components/KpiTile';
import { jsonEqual, useLocal } from '../../lib/store';

const DAY = 86_400_000;
type Days = 7 | 30 | 90;

const SEGMENTS: Array<{ key: CustomerSegment; label: string; hint: string }> = [
  { key: 'recent', label: 'Recently seen', hint: 'Latest visit first' },
  { key: 'top', label: 'Top spenders', hint: 'Most spent, all time' },
  { key: 'frequent', label: 'Most visits', hint: 'Days they came' },
  { key: 'members', label: 'Signed in', hint: 'Google accounts' },
  { key: 'new', label: 'New this week', hint: 'First visit in 7 days' },
  { key: 'lapsed', label: 'Lapsed', hint: 'Not back in 30+ days' },
];

// Second chart hue next to Terracotta: Muted Olive from the palette (different lightness and hue).
const FIRST_RGB = '105 116 91';

const TAG_STYLE: Record<CustomerTag, { label: string; className: string }> = {
  member: { label: 'Signed in', className: 'bg-ready-tint text-ready' },
  regular: { label: 'Regular', className: 'bg-accent-tint text-accent-ink' },
  new: { label: 'New', className: 'bg-ink/10 text-ink' },
  lapsed: { label: 'Lapsed', className: 'bg-surface-2 text-ink-3' },
};

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');
const dayLabel = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const dateTime = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

function ago(ms: number | undefined, now = Date.now()): string {
  if (!ms) return '—';
  const d = Math.floor((now - ms) / DAY);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d} days ago`;
  return dayLabel.format(ms);
}

const nameOf = (c: CustomerRecord) => c.name || c.displayName || 'Guest';

function usualShop(c: CustomerRecord, names: Record<string, string>): string | null {
  const top = Object.entries(c.byVendor ?? {}).sort((a, b) => b[1].orders - a[1].orders || b[1].spendPaise - a[1].spendPaise)[0];
  return top ? names[top[0]] ?? null : null;
}

interface ListState {
  rows: CustomerRecord[];
  cursor: CustomerPage['cursor'];
  loading: boolean;
  error: string | null;
}

export function Customers() {
  const [days, setDays] = useState<Days>(30);
  const [insights, setInsights] = useState<CustomerInsights | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [segment, setSegment] = useState<CustomerSegment>('recent');
  const [list, setList] = useState<ListState>({ rows: [], cursor: null, loading: true, error: null });
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<CustomerRecord[] | null>(null);
  const [open, setOpen] = useState<CustomerRecord | null>(null);
  const names = useLocal((s) => Object.fromEntries(s.vendors.map((v) => [v.id, v.name])), jsonEqual);

  const loadInsights = useCallback(() => {
    setInsightsError(null);
    getCustomerInsights(days)
      .then(setInsights)
      .catch((err: Error) => setInsightsError(err.message));
  }, [days]);
  useEffect(loadInsights, [loadInsights]);

  useEffect(() => {
    let live = true;
    setList({ rows: [], cursor: null, loading: true, error: null });
    listCustomers(segment)
      .then((p) => live && setList({ ...p, loading: false, error: null }))
      .catch((err: Error) => live && setList({ rows: [], cursor: null, loading: false, error: err.message }));
    return () => {
      live = false;
    };
  }, [segment]);

  const more = () => {
    if (!list.cursor || list.loading) return;
    setList((p) => ({ ...p, loading: true }));
    listCustomers(segment, list.cursor)
      .then((p) => setList((prev) => ({ rows: [...prev.rows, ...p.rows], cursor: p.cursor, loading: false, error: null })))
      .catch((err: Error) => setList((prev) => ({ ...prev, loading: false, error: err.message })));
  };

  const find = (e: FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return setResults(null);
    findCustomers(search)
      .then(setResults)
      .catch(() => setResults([]));
  };

  const rows = results ?? list.rows;
  const visitors = insights?.series.reduce((n, p) => n + p.visitors, 0) ?? 0;
  const orderedVisitors = insights?.series.reduce((n, p) => n + p.ordered, 0) ?? 0;
  const closeDrawer = useCallback(() => setOpen(null), []);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Period" className="inline-flex rounded-full bg-surface p-1 shadow-card ring-1 ring-inset ring-line/70">
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={days === d}
              onClick={() => setDays(d)}
              className={cx('h-9 rounded-full px-4 text-sm font-medium transition-colors', days === d ? 'bg-ink text-surface' : 'text-ink-2 hover:text-ink')}
            >
              {d} days
            </button>
          ))}
        </div>
        <form onSubmit={find} className="flex w-full items-center gap-2 rounded-full bg-surface py-1 pl-4 pr-1 shadow-card ring-1 ring-inset ring-line/70 sm:w-[360px]">
          <Search className="h-4 w-4 shrink-0 text-ink-3" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!e.target.value) setResults(null);
            }}
            placeholder="Mobile number or email"
            aria-label="Find a customer by mobile number or email"
            className="h-9 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
          <Button size="sm" type="submit">
            Find
          </Button>
        </form>
      </div>

      {insightsError ? (
        <p role="alert" className="mt-5 flex items-center justify-between gap-3 rounded-card bg-danger-tint px-4 py-3 text-sm text-danger">
          {insightsError}
          <Button size="sm" variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={loadInsights}>
            Try again
          </Button>
        </p>
      ) : (
        <dl className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            feature
            label="Customers"
            value={insights ? insights.totalCustomers.toLocaleString('en-IN') : '…'}
            icon={Users}
            tone="accent"
            hint={insights ? `${insights.newInRange} new and ${insights.activeInRange} active in ${days} days` : 'Loading'}
          />
          <KpiTile
            label="Came back and ordered again"
            value={insights ? pct(insights.repeat, insights.ordered) : '…'}
            icon={Crown}
            tone="ready"
            hint={insights ? `${insights.repeat} of ${insights.ordered} who ordered` : undefined}
          />
          <KpiTile
            label="Signed in"
            value={insights ? pct(insights.members, insights.totalCustomers) : '…'}
            icon={ShieldCheck}
            tone="prep"
            hint={insights ? `${insights.members} Google accounts` : undefined}
          />
          <KpiTile label="Lapsed" value={insights ? insights.lapsed.toLocaleString('en-IN') : '…'} icon={UserRoundX} hint="Not back in 30+ days" />
        </dl>
      )}

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="visitors" className="rounded-sheet bg-surface p-6 shadow-card ring-1 ring-inset ring-line/70">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="visitors" className="text-lg font-semibold tracking-tight text-ink">
              Visitors {insights?.granularity === 'week' ? 'by week' : 'by day'}
            </h2>
            <Legend />
          </div>
          <div className="mt-6">{insights ? <VisitorBars insights={insights} /> : <div className="shimmer h-56 rounded-card" />}</div>
        </section>
        <section aria-labelledby="habits" className="rounded-sheet bg-surface p-6 shadow-card ring-1 ring-inset ring-line/70">
          <h2 id="habits" className="text-lg font-semibold tracking-tight text-ink">
            Habits
          </h2>
          <dl className="mt-5 space-y-5">
            <Habit label="Visits that ended in an order" value={pct(orderedVisitors, visitors)} hint={`${orderedVisitors} of ${visitors} visits in ${days} days`} />
            <Habit label="Orders per customer" value={insights && insights.ordered > 0 ? (insights.totalOrders / insights.ordered).toFixed(1) : '—'} hint="Among customers who ordered, all time" />
            <Habit
              label="Spend per customer"
              value={insights && insights.ordered > 0 ? formatPaise(Math.round(insights.totalSpendPaise / insights.ordered)) : '—'}
              hint="Before refunds, all time"
            />
          </dl>
        </section>
      </div>

      <section aria-labelledby="people" className="mt-6 overflow-hidden rounded-sheet bg-surface shadow-card ring-1 ring-inset ring-line/70">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5">
          <h2 id="people" className="text-lg font-semibold tracking-tight text-ink">
            {results ? `Search results (${results.length})` : 'People'}
          </h2>
          {results && (
            <Button
              size="sm"
              variant="ghost"
              icon={<X className="h-4 w-4" />}
              onClick={() => {
                setResults(null);
                setSearch('');
              }}
            >
              Clear search
            </Button>
          )}
        </div>
        {!results && (
          <div role="tablist" aria-label="Customer groups" className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto px-6">
            {SEGMENTS.map((s) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={segment === s.key}
                title={s.hint}
                onClick={() => setSegment(s.key)}
                className={cx(
                  'h-9 shrink-0 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset transition-colors',
                  segment === s.key ? 'bg-accent-tint text-accent-ink ring-accent-line' : 'bg-surface text-ink-2 ring-line hover:text-ink'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-bg/60 text-xs text-ink-3">
              <tr>
                <th className="py-3 pl-6 pr-3 font-medium">Customer</th>
                <th className="px-3 py-3 font-medium">Contact</th>
                <th className="px-3 py-3 text-right font-medium">Days visited</th>
                <th className="px-3 py-3 text-right font-medium">Orders</th>
                <th className="px-3 py-3 text-right font-medium">Spent</th>
                <th className="px-3 py-3 font-medium">Usual shop</th>
                <th className="py-3 pl-3 pr-6 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/80">
              {rows.map((c) => (
                <tr key={c.uid} onClick={() => setOpen(c)} className="cursor-pointer transition-colors hover:bg-accent-tint/40">
                  <td className="py-3 pl-6 pr-3">
                    <span className="flex items-center gap-3">
                      <Face c={c} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{nameOf(c)}</span>
                        <Tags c={c} />
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3 text-ink-2">
                    <span className="block tabular-nums">{maskPhone(c.phone) || '—'}</span>
                    {c.email && <span className="block max-w-[200px] truncate text-xs text-ink-3">{c.email}</span>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-2">{c.visits ?? 0}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-2">{c.orders ?? 0}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink">{formatPaise(c.spendPaise ?? 0)}</td>
                  <td className="px-3 py-3 text-ink-2">{usualShop(c, names) ?? '—'}</td>
                  <td className="py-3 pl-3 pr-6 text-ink-2">{ago(c.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !list.loading && (
            <p className="px-6 py-14 text-center text-sm text-ink-3">
              {list.error ?? (results ? 'No customer with that mobile number or email.' : 'No one here yet. Customers appear as soon as they scan a table.')}
            </p>
          )}
          {list.loading && rows.length === 0 && <div className="mx-6 my-4 h-40 shimmer rounded-card" />}
        </div>
        {!results && list.cursor && (
          <div className="border-t border-line px-6 py-3">
            <Button variant="ghost" loading={list.loading} onClick={more}>
              Show more
            </Button>
          </div>
        )}
      </section>

      <CustomerDrawer customer={open} names={names} onClose={closeDrawer} />
    </>
  );
}

function Habit({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</dd>
      <p className="text-xs text-ink-3">{hint}</p>
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex items-center gap-4 text-xs text-ink-2" aria-label="Legend">
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[3px] bg-accent" aria-hidden />
        Returning
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: `rgb(${FIRST_RGB})` }} aria-hidden />
        First visit
      </li>
    </ul>
  );
}

// Stacked bars: returning on the baseline, first visits above, a 2px surface gap between them.
function VisitorBars({ insights }: { insights: CustomerInsights }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...insights.series.map((p) => p.visitors));
  const ticks = [max, Math.round(max / 2), 0];
  if (insights.series.every((p) => p.visitors === 0)) {
    return <p className="py-16 text-center text-sm text-ink-3">No visits in this period yet. Bars appear as diners scan their tables.</p>;
  }
  const every = Math.ceil(insights.series.length / 8);
  return (
    <figure aria-label="Visitors per period, split into first visits and returning visitors">
      <div className="grid grid-cols-[2rem_1fr] gap-3">
        <div className="flex h-56 flex-col justify-between pb-6 text-right text-2xs tabular-nums text-ink-3" aria-hidden>
          {ticks.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
        <div className="relative h-56">
          <div className="pointer-events-none absolute inset-x-0 bottom-6 top-0 flex flex-col justify-between" aria-hidden>
            {ticks.map((t, i) => (
              <span key={i} className={cx('block h-px', t === 0 ? 'bg-line-strong' : 'bg-line/70')} />
            ))}
          </div>
          <ol className="absolute inset-x-0 bottom-6 top-0 flex items-end gap-[3px]">
            {insights.series.map((p, i) => {
              const returning = p.visitors - p.newVisitors;
              const label = insights.granularity === 'week' ? `Week of ${dayLabel.format(Date.parse(p.key))}` : dayLabel.format(Date.parse(p.key));
              return (
                <li
                  key={p.key}
                  className="relative flex h-full flex-1 flex-col justify-end"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  aria-label={`${label}: ${p.visitors} visitors, ${p.newVisitors} first visits, ${p.ordered} ordered`}
                >
                  <span
                    className={cx('flex flex-col justify-end gap-[2px] transition-opacity duration-150', hover !== null && hover !== i && 'opacity-40')}
                    style={{ height: `${(p.visitors / max) * 100}%` }}
                  >
                    {p.newVisitors > 0 && <span className="block w-full rounded-t-[4px]" style={{ flexGrow: p.newVisitors, background: `rgb(${FIRST_RGB})` }} />}
                    {returning > 0 && <span className={cx('block w-full bg-accent', p.newVisitors === 0 && 'rounded-t-[4px]')} style={{ flexGrow: returning }} />}
                  </span>
                  {hover === i && (
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-[1] mb-2 -translate-x-1/2 whitespace-nowrap rounded-field bg-ink px-3 py-2 text-xs text-surface shadow-float">
                      <span className="block text-surface/70">{label}</span>
                      <span className="block font-semibold tabular-nums">{p.visitors} visitors</span>
                      <span className="block tabular-nums">
                        {returning} returning · {p.newVisitors} first visit
                      </span>
                      <span className="block tabular-nums text-surface/80">{pct(p.ordered, p.visitors)} ordered</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <ol className="absolute inset-x-0 bottom-0 flex h-5 gap-[3px] text-2xs text-ink-3" aria-hidden>
            {insights.series.map((p, i) => (
              <li key={p.key} className="flex-1 truncate text-center">
                {i % every === 0 ? dayLabel.format(Date.parse(p.key)) : ''}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </figure>
  );
}

function Face({ c, size = 36 }: { c: CustomerRecord; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (c.photoURL && !broken) {
    return (
      <img
        src={c.photoURL}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-ink-2" style={{ width: size, height: size }} aria-hidden>
      {nameOf(c).charAt(0).toUpperCase()}
    </span>
  );
}

function Tags({ c }: { c: CustomerRecord }) {
  const tags = customerTags(c);
  if (tags.length === 0) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className={cx('inline-flex h-5 items-center rounded-full px-2 text-2xs font-semibold', TAG_STYLE[t].className)}>
          {TAG_STYLE[t].label}
        </span>
      ))}
    </span>
  );
}

const ORDER_LABEL: Partial<Record<Order['status'], string>> = {
  PAID: 'In the kitchen',
  COMPLETED: 'Collected',
  PARTIALLY_REFUNDED: 'Part refunded',
  CANCELLED: 'Refunded',
  PENDING_PAYMENT: 'Awaiting payment',
  FAILED: 'Payment failed',
  EXPIRED: 'Not paid',
};

const cleanName = (name: string) => name.replace(/^[^\p{L}\p{N}]+/u, '').trim();

export function CustomerDrawer({ customer: c, names, onClose }: { customer: CustomerRecord | null; names: Record<string, string>; onClose: () => void }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState<CustomerRecord | null>(c);
  const panelRef = useRef<HTMLElement>(null);
  const categoryNames = useLocal((s) => {
    const out: Record<string, string> = {};
    for (const [vendorId, menu] of Object.entries(s.menus)) for (const cat of menu.categories) out[`${vendorId}__${cat.id}`] = cleanName(cat.name);
    return out;
  }, jsonEqual);

  useEffect(() => {
    if (c) {
      setShown(c);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setVisible(false);
    const t = setTimeout(() => setShown(null), 300);
    return () => clearTimeout(t);
  }, [c]);

  useEffect(() => {
    if (!c) return;
    setOrders(null);
    customerOrders(c.uid)
      .then(setOrders)
      .catch(() => setOrders([]));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [c, onClose]);

  const shops = useMemo(
    () =>
      Object.entries(shown?.byVendor ?? {})
        .sort((a, b) => b[1].spendPaise - a[1].spendPaise)
        .map(([id, v]) => ({ key: id, label: `${names[id] ?? id} · ${v.orders} ${v.orders === 1 ? 'order' : 'orders'}`, value: v.spendPaise, display: formatPaise(v.spendPaise) })),
    [shown, names]
  );
  const categories = useMemo(
    () =>
      Object.entries(shown?.byCategory ?? {})
        .sort((a, b) => b[1].qty - a[1].qty)
        .slice(0, 6)
        .map(([key, v]) => ({
          key,
          label: `${categoryNames[key] ?? 'Other'} · ${names[key.split('__')[0]!] ?? ''}`,
          value: v.qty,
          display: `${v.qty} ${v.qty === 1 ? 'dish' : 'dishes'}`,
        })),
    [shown, categoryNames, names]
  );

  if (!shown) return null;
  const avg = shown.orders > 0 ? Math.round(shown.spendPaise / shown.orders) : 0;

  return (
    <div className="fixed inset-0 z-sheet">
      <div onClick={onClose} aria-hidden className={cx('absolute inset-0 bg-scrim/40 transition-opacity duration-300', visible ? 'opacity-100' : 'opacity-0')} />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Customer ${nameOf(shown)}`}
        className={cx(
          'absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col bg-bg shadow-sheet outline-none transition-transform duration-300 ease-drawer',
          visible ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <header className="flex items-start gap-4 border-b border-line bg-surface px-6 py-5">
          <Face c={shown} size={52} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-semibold tracking-tight text-ink">{nameOf(shown)}</p>
            <Tags c={shown} />
            <p className="mt-1 text-sm tabular-nums text-ink-2">{shown.phone ? `+91 ${shown.phone.slice(0, 5)} ${shown.phone.slice(5)}` : 'No mobile number'}</p>
            {shown.email && <p className="truncate text-sm text-ink-3">{shown.email}</p>}
            {shown.member && (
              <Button
                size="sm"
                variant="tint"
                className="mt-3"
                icon={<Megaphone className="h-4 w-4" />}
                onClick={() => {
                  try {
                    sessionStorage.setItem(MESSAGE_TO_KEY, JSON.stringify({ uid: shown.uid, name: nameOf(shown) }));
                  } catch {
                    // storage blocked: the composer opens without them
                  }
                  window.location.hash = '/messages';
                }}
              >
                Send a message
              </Button>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
            <X className="h-[18px] w-[18px]" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <dl className="grid grid-cols-2 gap-3">
            <Mini label="Days visited" value={String(shown.visits ?? 0)} />
            <Mini label="Orders" value={String(shown.orders ?? 0)} />
            <Mini label="Spent" value={formatPaise(shown.spendPaise ?? 0)} />
            <Mini label="Average order" value={avg ? formatPaise(avg) : '—'} />
          </dl>
          <p className="mt-3 flex items-center gap-2 text-sm text-ink-3">
            <CalendarClock className="h-4 w-4 shrink-0" />
            First came {shown.firstSeenAt ? dayLabel.format(shown.firstSeenAt) : '—'} · last seen {ago(shown.lastSeenAt).toLowerCase()}
          </p>

          <h3 className="mt-7 text-base font-semibold text-ink">Shops</h3>
          <div className="mt-3">{shops.length > 0 ? <ShareBars rows={shops} /> : <p className="text-sm text-ink-3">No orders yet.</p>}</div>

          {categories.length > 0 && (
            <>
              <h3 className="mt-7 text-base font-semibold text-ink">What they order</h3>
              <div className="mt-3">
                <ShareBars rows={categories} />
              </div>
            </>
          )}

          <h3 className="mt-7 text-base font-semibold text-ink">Recent orders</h3>
          {orders === null ? (
            <div className="mt-3 h-24 shimmer rounded-card" />
          ) : orders.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">No orders yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-inset ring-line/70">
              {orders.map((o) => (
                <li key={o.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-ink">{dateTime.format(o.createdAt)}</span>
                    <span className="text-sm font-semibold tabular-nums text-ink">{formatPaise(o.totals.totalPaise)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-3">
                    {ORDER_LABEL[o.status] ?? o.status} · {placeName(o)} · {o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-surface px-4 py-3 ring-1 ring-inset ring-line/70">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-ink">{value}</dd>
    </div>
  );
}
