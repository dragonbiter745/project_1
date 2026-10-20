import { useEffect, useState, type ComponentType } from 'react';
import { CalendarDays, Landmark, LayoutDashboard, LogOut, ReceiptText, ShieldAlert } from 'lucide-react';
import { ActionToast, BrandMark, Button, StaffLogin, cx } from '@foodcourt/ui';
import { staffSignIn, staffSignOut, watchStaff, type StaffUser } from '@foodcourt/firebase-client/staff';
import { Overview } from './features/overview/Overview';
import { Transactions } from './features/transactions/Transactions';
import { Payouts } from './features/payouts/Payouts';
import { PRESETS, presetRange, rangeLabel, type Range } from './lib/range';
import { useReport, type ReportState } from './lib/useReport';

type Page = 'overview' | 'transactions' | 'payouts';

export interface PageProps {
  range: Range;
  report: ReportState;
}

const PAGES: Array<{ key: Page; label: string; icon: typeof LayoutDashboard; component: ComponentType<PageProps> }> = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard, component: Overview },
  { key: 'transactions', label: 'Transactions', icon: ReceiptText, component: Transactions },
  { key: 'payouts', label: 'Payouts', icon: Landmark, component: Payouts },
];

const readPage = (): Page => {
  const key = window.location.hash.replace('#/', '') as Page;
  return PAGES.some((p) => p.key === key) ? key : 'overview';
};

export default function App() {
  // undefined while Firebase restores the session, null when signed out.
  const [staff, setStaff] = useState<StaffUser | null | undefined>(undefined);
  useEffect(() => watchStaff(setStaff), []);
  if (staff === undefined) return <div className="grain min-h-[100dvh]" aria-busy="true" />;
  if (!staff) {
    return <StaffLogin title="Finance" subtitle="Collections, shop earnings and payouts. Finance team sign-in." onSubmit={staffSignIn} />;
  }
  if (staff.role !== 'finance' && staff.role !== 'master') return <NoAccess email={staff.email} />;
  return <Console staff={staff} />;
}

function NoAccess({ email }: { email: string | null }) {
  return (
    <main className="grain grid min-h-[100dvh] place-items-center px-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger-tint text-danger">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink">Finance access only</h1>
        <p className="mt-2 text-sm text-ink-3">{email} cannot open the finance console.</p>
        <Button variant="outline" className="mt-6" onClick={() => void staffSignOut()} icon={<LogOut className="h-4 w-4" />}>
          Sign out
        </Button>
      </div>
    </main>
  );
}

function Console({ staff }: { staff: StaffUser }) {
  const [page, setPage] = useState<Page>(readPage);
  const [range, setRange] = useState<Range>(() => presetRange('today'));
  const report = useReport(range);
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
    <div className="grain ambient min-h-[100dvh]">
      <header className="sticky top-0 z-header border-b border-line/70 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark size="sm" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-base font-semibold tracking-tight text-ink">REVA Food Court</p>
              <p className="text-xs font-medium text-ink-3">Finance</p>
            </div>
          </div>
          <nav aria-label="Sections" className="order-3 flex w-full gap-1 md:order-none md:w-auto">
            {PAGES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                aria-current={page === key ? 'page' : undefined}
                onClick={() => go(key)}
                className={cx(
                  'pressable inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors duration-150',
                  page === key ? 'bg-accent-tint text-accent-ink ring-1 ring-inset ring-accent-line' : 'text-ink-2 hover:bg-surface-2'
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
                {label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => void staffSignOut()}
            title={`Sign out ${staff.email ?? ''}`}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] px-5 pb-16 pt-7 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{current.label}</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-3">
              <CalendarDays className="h-4 w-4" /> {rangeLabel(range)} · all shops
            </p>
          </div>
          <RangePicker value={range} onChange={setRange} />
        </div>
        <div key={page} className="enter-up mt-6">
          <Page range={range} report={report} />
        </div>
      </main>
      <ActionToast />
    </div>
  );
}

function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const today = presetRange('today').to;
  const input =
    'h-9 rounded-full bg-surface px-3 text-sm tabular-nums text-ink outline-none ring-1 ring-inset ring-line focus:ring-2 focus:ring-accent/50';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="Period" className="no-scrollbar flex max-w-full overflow-x-auto rounded-full bg-surface-2 p-1">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={value.preset === p.key}
            onClick={() => onChange(presetRange(p.key))}
            className={cx(
              'h-8 shrink-0 rounded-full px-3 text-sm font-medium transition-[background-color,color,box-shadow] duration-200',
              value.preset === p.key ? 'bg-surface text-ink shadow-thumb' : 'text-ink-3 hover:text-ink'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="range-from">
        From
      </label>
      <input
        id="range-from"
        type="date"
        value={value.from}
        max={value.to}
        onChange={(e) => e.target.value && onChange({ preset: 'custom', from: e.target.value, to: value.to })}
        className={input}
      />
      <span className="text-sm text-ink-3">to</span>
      <label className="sr-only" htmlFor="range-to">
        To
      </label>
      <input
        id="range-to"
        type="date"
        value={value.to}
        min={value.from}
        max={today}
        onChange={(e) => e.target.value && onChange({ preset: 'custom', from: value.from, to: e.target.value })}
        className={input}
      />
    </div>
  );
}
