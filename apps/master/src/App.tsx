import { useEffect, useState, type ComponentType } from 'react';
import { BarChart3, LogOut, Megaphone, QrCode, Radio, Settings2, ShieldAlert, Store, TicketPercent, Users, Wallet } from 'lucide-react';
import { CourtFinance } from '@foodcourt/finance-ui';
import { ActionToast, BrandMark, Button, StaffLogin, cx, useNow } from '@foodcourt/ui';
import { connectMaster } from '@foodcourt/firebase-client/live';
import { staffSignIn, staffSignOut, watchStaff, type StaffUser } from '@foodcourt/firebase-client/staff';
import { Coupons } from './features/coupons/Coupons';
import { Customers } from './features/customers/Customers';
import { Insights } from './features/insights/Insights';
import { Messages } from './features/messages/Messages';
import { LiveOrders } from './features/live/LiveOrders';
import { Settings } from './features/settings/Settings';
import { Shops } from './features/shops/Shops';
import { TablesQr } from './features/tables/TablesQr';
import { jsonEqual, useLocal } from './lib/store';

type Page = 'live' | 'shops' | 'tables' | 'insights' | 'customers' | 'coupons' | 'messages' | 'finance' | 'settings';

const PAGES: Array<{ key: Page; label: string; blurb: string; icon: typeof Radio; component: ComponentType }> = [
  { key: 'live', label: 'Live orders', blurb: 'Every ticket in every kitchen, as it happens.', icon: Radio, component: LiveOrders },
  { key: 'shops', label: 'Shops', blurb: 'How each kitchen is doing today.', icon: Store, component: Shops },
  { key: 'tables', label: 'Tables and QR', blurb: 'Print and replace the codes on every table.', icon: QrCode, component: TablesQr },
  { key: 'insights', label: 'Insights', blurb: "Today's orders, sales and kitchen speed.", icon: BarChart3, component: Insights },
  { key: 'customers', label: 'Customers', blurb: 'Who comes, how often, and what they order.', icon: Users, component: Customers },
  { key: 'coupons', label: 'Coupons', blurb: 'Discount codes for the court, chosen shops or categories.', icon: TicketPercent, component: Coupons },
  { key: 'messages', label: 'Messages', blurb: 'Inbox messages and phone alerts to diners, announcements to kitchens.', icon: Megaphone, component: Messages },
  { key: 'finance', label: 'Finance', blurb: 'Commission income, shop balances and payouts.', icon: Wallet, component: CourtFinance },
  { key: 'settings', label: 'Settings', blurb: 'Switches that affect every shop at once.', icon: Settings2, component: Settings },
];

const readPage = (): Page => {
  const key = window.location.hash.replace('#/', '') as Page;
  return PAGES.some((p) => p.key === key) ? key : 'live';
};

const dateFormat = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
const timeFormat = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export default function App() {
  // undefined while Firebase restores the session, null when signed out.
  const [staff, setStaff] = useState<StaffUser | null | undefined>(undefined);
  useEffect(() => watchStaff(setStaff), []);
  if (staff === undefined) return <div className="grain min-h-[100dvh]" aria-busy="true" />;
  if (!staff) {
    return <StaffLogin title="Operations console" subtitle="Court manager sign-in. Kitchen accounts use the kitchen display instead." onSubmit={staffSignIn} />;
  }
  if (staff.role !== 'master') return <NoAccess email={staff.email} />;
  return <Console staff={staff} />;
}

function NoAccess({ email }: { email: string | null }) {
  return (
    <main className="grain grid min-h-[100dvh] place-items-center px-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger-tint text-danger">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink">Manager access only</h1>
        <p className="mt-2 text-sm text-ink-3">{email} cannot open the operations console.</p>
        <Button variant="outline" className="mt-6" onClick={() => void staffSignOut()} icon={<LogOut className="h-4 w-4" />}>
          Sign out
        </Button>
      </div>
    </main>
  );
}

function Console({ staff }: { staff: StaffUser }) {
  useEffect(() => connectMaster(), []);
  const [page, setPage] = useState<Page>(readPage);
  const flags = useLocal((s) => s.config.flags, jsonEqual);
  const live = useLocal(
    (s) => ({
      active: Object.values(s.subOrders).filter((o) => ['NEW', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status)).length,
      open: s.vendors.filter((v) => v.acceptingOrders).length,
      shops: s.vendors.length,
    }),
    jsonEqual
  );
  const now = useNow(30_000);
  const current = PAGES.find((p) => p.key === page)!;
  const Page = current.component;

  useEffect(() => {
    const onHash = () => setPage(readPage());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (key: Page) => {
    window.location.hash = `/${key}`;
    setPage(key);
  };

  return (
    <div className="grain min-h-[100dvh] lg:flex">
      <aside
        data-print="hide"
        className="hidden border-r border-line/80 bg-surface/70 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:w-[264px] lg:shrink-0 lg:flex-col lg:px-4 lg:py-6"
      >
        <div className="flex items-center gap-3 px-2">
          <BrandMark />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-tight text-ink">REVA Food Court</p>
            <p className="text-xs font-medium text-ink-3">Operations console</p>
          </div>
        </div>

        <nav aria-label="Sections" className="mt-9 space-y-1">
          {PAGES.map(({ key, label, icon: Icon }) => {
            const active = page === key;
            return (
              <button
                key={key}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => go(key)}
                className={cx(
                  'group relative flex h-11 w-full items-center gap-3 rounded-field px-3 text-sm font-medium transition-[background-color,color,box-shadow] duration-200',
                  active ? 'bg-surface text-ink shadow-card ring-1 ring-inset ring-line/70' : 'text-ink-3 hover:bg-surface/80 hover:text-ink'
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    'absolute -left-4 top-2.5 h-6 w-1 rounded-r-full bg-accent transition-transform duration-300 ease-out',
                    active ? 'scale-y-100' : 'scale-y-0'
                  )}
                />
                <Icon className={cx('h-[18px] w-[18px] transition-colors', active ? 'text-accent-ink' : 'text-ink-3 group-hover:text-ink-2')} strokeWidth={2} />
                {label}
              </button>
            );
          })}
        </nav>

        <section aria-label="Right now" className="mt-auto rounded-sheet bg-surface p-4 shadow-card ring-1 ring-inset ring-line/70">
          <p className="flex items-center gap-2 text-xs font-semibold text-ink-2">
            <span className="live-dot h-2 w-2 rounded-full bg-ready" aria-hidden />
            Right now
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-ink-3">Active tickets</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums text-ink">{live.active}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Shops open</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums text-ink">
                {live.open}
                <span className="text-sm font-medium text-ink-3">/{live.shops}</span>
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
            <Flag on={flags.paymentsEnabled} label={flags.paymentsEnabled ? 'Online payments' : 'Pay at counter'} />
            {flags.maintenance && <Flag on={false} danger label="Maintenance on" />}
          </div>
        </section>
        <button
          type="button"
          onClick={() => void staffSignOut()}
          className="mt-3 flex h-10 items-center gap-2 rounded-field px-3 text-sm font-medium text-ink-3 transition-colors hover:bg-surface hover:text-ink"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className="truncate">Sign out {staff.email}</span>
        </button>
      </aside>

      <div className="ambient min-w-0 flex-1">
        <header data-print="hide" className="sticky top-0 z-header border-b border-line/70 bg-bg/75 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-6 px-5 py-4 lg:px-10">
            <div className="flex min-w-0 items-center gap-3">
              <span className="lg:hidden">
                <BrandMark size="sm" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{current.label}</h1>
                <p className="mt-0.5 hidden text-sm text-ink-3 sm:block">{current.blurb}</p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-xl font-semibold tabular-nums tracking-tight text-ink">{timeFormat.format(now)}</p>
              <p className="text-xs text-ink-3">{dateFormat.format(now)}</p>
            </div>
          </div>
          <nav aria-label="Sections" className="no-scrollbar flex gap-1.5 overflow-x-auto px-5 pb-3 lg:hidden">
            {PAGES.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-current={page === key ? 'page' : undefined}
                onClick={() => go(key)}
                className={cx(
                  'h-9 shrink-0 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset transition-colors',
                  page === key ? 'bg-accent-tint text-accent-ink ring-accent-line' : 'bg-surface text-ink-2 ring-line'
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        </header>

        {flags.maintenance && (
          <div data-print="hide" className="mx-auto max-w-[1320px] px-5 pt-5 lg:px-10">
            <p role="status" className="rounded-card bg-danger-tint px-4 py-3 text-sm font-medium text-danger ring-1 ring-inset ring-danger/20">
              Maintenance mode is on. No shop can take new orders until it is switched off in Settings.
            </p>
          </div>
        )}

        <main key={page} className="enter-up mx-auto max-w-[1320px] px-5 py-7 lg:px-10">
          <Page />
        </main>
        <ActionToast />
      </div>
    </div>
  );
}

function Flag({ on, label, danger }: { on: boolean; label: string; danger?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold',
        danger ? 'bg-danger-tint text-danger' : on ? 'bg-ready-tint text-ready' : 'bg-prep-tint text-prep'
      )}
    >
      {label}
    </span>
  );
}
