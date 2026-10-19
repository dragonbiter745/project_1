import { useEffect, useState, type ComponentType } from 'react';
import { BarChart3, QrCode, Radio, Settings2, Store } from 'lucide-react';
import { cx } from '@foodcourt/ui';
import { Insights } from './features/insights/Insights';
import { LiveOrders } from './features/live/LiveOrders';
import { Settings } from './features/settings/Settings';
import { Shops } from './features/shops/Shops';
import { TablesQr } from './features/tables/TablesQr';
import { jsonEqual, useLocal } from './lib/store';

type Page = 'live' | 'shops' | 'tables' | 'insights' | 'settings';

const PAGES: Array<{ key: Page; label: string; icon: typeof Radio; component: ComponentType }> = [
  { key: 'live', label: 'Live orders', icon: Radio, component: LiveOrders },
  { key: 'shops', label: 'Shops', icon: Store, component: Shops },
  { key: 'tables', label: 'Tables and QR', icon: QrCode, component: TablesQr },
  { key: 'insights', label: 'Insights', icon: BarChart3, component: Insights },
  { key: 'settings', label: 'Settings', icon: Settings2, component: Settings },
];

const readPage = (): Page => {
  const key = window.location.hash.replace('#/', '') as Page;
  return PAGES.some((p) => p.key === key) ? key : 'live';
};

const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(
  new Date()
);

export default function App() {
  const [page, setPage] = useState<Page>(readPage);
  const flags = useLocal((s) => s.config.flags, jsonEqual);
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
    <div className="min-h-[100dvh] lg:flex">
      <aside
        data-print="hide"
        className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:w-64 lg:shrink-0 lg:flex-col lg:px-4 lg:py-6"
      >
        <div className="px-3">
          <p className="text-lg font-semibold tracking-tight text-ink">REVA Food Court</p>
          <p className="text-sm text-ink-3">Admin</p>
        </div>
        <nav aria-label="Sections" className="mt-8 space-y-1">
          {PAGES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              aria-current={page === key ? 'page' : undefined}
              onClick={() => go(key)}
              className={cx(
                'flex h-11 w-full items-center gap-3 rounded-field px-3 text-sm font-medium transition-colors',
                page === key ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:bg-bg hover:text-ink'
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </nav>
        <dl className="mt-auto space-y-2 rounded-card bg-bg p-4 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-ink-3">Payments</dt>
            <dd className="font-medium text-ink">{flags.paymentsEnabled ? 'Online' : 'At counter'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-3">Maintenance</dt>
            <dd className={cx('font-medium', flags.maintenance ? 'text-danger' : 'text-ink')}>{flags.maintenance ? 'On' : 'Off'}</dd>
          </div>
        </dl>
      </aside>

      <div className="min-w-0 flex-1">
        <header data-print="hide" className="sticky top-0 z-header border-b border-line bg-bg/85 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between gap-4 px-5 lg:px-8">
            <h1 className="text-xl font-semibold tracking-tight text-ink">{current.label}</h1>
            <p className="text-sm text-ink-3">{today}</p>
          </div>
          <nav aria-label="Sections" className="no-scrollbar flex gap-1.5 overflow-x-auto px-5 pb-3 lg:hidden">
            {PAGES.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-current={page === key ? 'page' : undefined}
                onClick={() => go(key)}
                className={cx(
                  'h-9 shrink-0 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset',
                  page === key ? 'bg-ink text-surface ring-ink' : 'bg-surface text-ink-2 ring-line'
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        </header>
        {flags.maintenance && (
          <p role="status" data-print="hide" className="bg-danger-tint px-5 py-2.5 text-center text-sm font-medium text-danger lg:px-8">
            Maintenance mode is on. No shop can take new orders.
          </p>
        )}
        <main key={page} className="enter-up mx-auto max-w-[1320px] px-5 py-6 lg:px-8">
          <Page />
        </main>
      </div>
    </div>
  );
}
