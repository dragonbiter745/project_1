import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { House, Settings2, UtensilsCrossed, Wallet, type LucideIcon } from 'lucide-react';
import { connectVendor, whenVisible } from '@foodcourt/firebase-client/live';
import type { StaffUser } from '@foodcourt/firebase-client/staff';
import { BrandMark, Monogram, Skeleton, cx } from '@foodcourt/ui';
import { useLocal } from '../lib/store';
import { Home } from '../home/Home';
import { More } from '../more/More';
import { Menu } from '../menu/Menu';

const Finance = lazy(() => import('../finance/Finance'));

type Tab = 'home' | 'menu' | 'finance' | 'more';

const TABS: Array<{ key: Tab; label: string; icon: LucideIcon }> = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'menu', label: 'Menu', icon: UtensilsCrossed },
  { key: 'finance', label: 'Money', icon: Wallet },
  { key: 'more', label: 'More', icon: Settings2 },
];

const fromHash = (): Tab => {
  const h = location.hash.replace(/^#\/?/, '');
  return TABS.some((t) => t.key === h) ? (h as Tab) : 'home';
};

/**
 * Phone first: a bottom bar in thumb reach. From `lg` up the same places sit in a side rail.
 * The tab lives in the URL hash so refresh and the back button behave.
 */
export function Shell({ staff, vendorId }: { staff: StaffUser; vendorId: string }) {
  const [tab, setTab] = useState<Tab>(fromHash);
  useEffect(() => {
    const on = () => setTab(fromHash());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  // Pauses in a background tab; the kitchen screen is the one that has to keep listening all service.
  useEffect(() => whenVisible(() => connectVendor(vendorId)), [vendorId]);

  const vendor = useLocal((s) => s.vendors.find((v) => v.id === vendorId) ?? null, (a, b) => a?.name === b?.name && a?.code === b?.code);
  const go = (next: Tab) => {
    if (next === tab) return scrollTo({ top: 0, behavior: 'smooth' });
    location.hash = `/${next}`;
    scrollTo({ top: 0 });
  };

  // On Money the 3D rupees sit behind the whole page, so the side rail and bars turn to frosted glass
  // and let them show through; everywhere else they stay solid enough to read.
  const glass = tab === 'finance' ? 'bg-surface/40 backdrop-blur-md' : 'bg-surface/85 backdrop-blur-xl';

  let page: ReactNode;
  if (tab === 'home') page = <Home vendorId={vendorId} onOpenMoney={() => go('finance')} onOpenMenu={() => go('menu')} />;
  else if (tab === 'menu') page = <Menu vendorId={vendorId} />;
  else if (tab === 'finance') page = <Suspense fallback={<Skeleton className="h-64 w-full rounded-sheet" />}><Finance vendorId={vendorId} /></Suspense>;
  else page = <More staff={staff} vendorId={vendorId} />;

  return (
    <div className="grain ambient min-h-[100dvh]">
      <aside className={cx('fixed inset-y-0 left-0 z-header hidden w-60 flex-col overflow-y-auto border-r border-line/70 p-4 md:flex', glass)}>
        <img src="/qrave-wordmark.png" alt="Qrave" width="420" height="149" className="h-9 w-auto self-start select-none" draggable={false} />
        <div className="mt-5 border-t border-line/70 pt-5">
          <ShopTitle name={vendor?.name} code={vendor?.code} />
        </div>
        <nav className="mt-8 space-y-1" aria-label="Shop admin">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => go(t.key)}
              aria-current={tab === t.key ? 'page' : undefined}
              className={cx(
                'flex h-11 w-full items-center gap-3 rounded-card px-3 text-sm font-semibold transition-colors',
                tab === t.key ? 'bg-accent-tint text-accent-ink' : 'text-ink-2 hover:bg-surface-2'
              )}
            >
              <t.icon className="h-5 w-5" strokeWidth={2} /> {t.label}
            </button>
          ))}
        </nav>
      </aside>

      <header className={cx('sticky top-0 z-header border-b border-line/70 md:hidden', glass)}>
        <div className="flex items-center gap-3 px-4 py-3">
          <BrandMark size="sm" className="h-9 w-9" />
          <span aria-hidden className="h-8 w-px shrink-0 bg-line" />
          <div className="min-w-0">
            <ShopTitle name={vendor?.name} code={vendor?.code} />
          </div>
        </div>
      </header>

      <main className="px-4 pb-28 pt-5 md:ml-60 md:px-8 md:pb-16 md:pt-8">
        <div className="mx-auto max-w-[920px]">{page}</div>
      </main>

      <nav
        aria-label="Shop admin"
        className={cx('fixed inset-x-0 bottom-0 z-header border-t border-line/70 pb-[env(safe-area-inset-bottom)] md:hidden', glass)}
      >
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => go(t.key)}
                aria-current={tab === t.key ? 'page' : undefined}
                className={cx('pressable flex h-16 w-full flex-col items-center justify-center gap-1 text-xs font-semibold', tab === t.key ? 'text-accent-ink' : 'text-ink-3')}
              >
                <t.icon className="h-6 w-6" strokeWidth={tab === t.key ? 2.4 : 1.9} />
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function ShopTitle({ name, code }: { name?: string; code?: string }) {
  return (
    <div className="flex items-center gap-3">
      {code ? <Monogram code={code} tone="solid" /> : <BrandMark size="sm" />}
      <div className="min-w-0 leading-tight">
        <p className="truncate text-base font-semibold tracking-tight text-ink">{name ?? 'Your shop'}</p>
        <p className="text-xs font-medium text-ink-3">Shop admin</p>
      </div>
    </div>
  );
}
