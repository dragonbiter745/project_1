import { useEffect, useState, type ComponentType } from 'react';
import { BarChart3, QrCode, Radio, Settings2, Store } from 'lucide-react';
import { BrandMark, cx, useNow } from '@foodcourt/ui';
import { Insights } from './features/insights/Insights';
import { LiveOrders } from './features/live/LiveOrders';
import { Settings } from './features/settings/Settings';
import { Shops } from './features/shops/Shops';
import { TablesQr } from './features/tables/TablesQr';
import { jsonEqual, useLocal } from './lib/store';

type Page = 'live' | 'shops' | 'tables' | 'insights' | 'settings';

const PAGES: Array<{ key: Page; label: string; blurb: string; icon: typeof Radio; component: ComponentType }> = [
  { key: 'live', label: 'Live orders', blurb: 'Every ticket in every kitchen, as it happens.', icon: Radio, component: LiveOrders },
  { key: 'shops', label: 'Shops', blurb: 'How each kitchen is doing today.', icon: Store, component: Shops },
  { key: 'tables', label: 'Tables and QR', blurb: 'Print and replace the codes on every table.', icon: QrCode, component: TablesQr },
  { key: 'insights', label: 'Insights', blurb: "Today's orders, sales and kitchen speed.", icon: BarChart3, component: Insights },
  { key: 'settings', label: 'Settings', blurb: 'Switches that affect every shop at once.', icon: Settings2, component: Settings },
];

const readPage = (): Page => {
  const key = window.location.hash.replace('#/', '') as Page;
  return PAGES.some((p) => p.key === key) ? key : 'live';
};

const dateFormat = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
const timeFormat = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export default function App() {
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
