import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, CookingPot, PackageX, Store, Wallet } from 'lucide-react';
import { getShopReport } from '@foodcourt/firebase-client/finance';
import { formatPaise, getIstDateKey, type ShopReport } from '@foodcourt/shared';
import { Skeleton, cx } from '@foodcourt/ui';
import { useLocal } from '../lib/store';

/**
 * The first screen: is the shop taking orders, how is today going, and is anything waiting for
 * the owner. Plain words, a few big numbers, nothing to configure.
 */
export function Home({ vendorId, onOpenMoney, onOpenMenu }: { vendorId: string; onOpenMoney: () => void; onOpenMenu: () => void }) {
  const vendor = useLocal((s) => s.vendors.find((v) => v.id === vendorId) ?? null);
  const soldOut = useLocal((s) => Object.values(s.availability[vendorId]?.unavailable ?? {}).filter(Boolean).length);
  const kitchen = useLocal(
    (s) => {
      const rows = Object.values(s.subOrders);
      return {
        waiting: rows.filter((t) => t.status === 'NEW').length,
        cooking: rows.filter((t) => t.status === 'ACCEPTED' || t.status === 'PREPARING').length,
        ready: rows.filter((t) => t.status === 'READY').length,
      };
    },
    (a, b) => a.waiting === b.waiting && a.cooking === b.cooking && a.ready === b.ready
  );
  const today = useToday(vendorId);

  const open = vendor?.acceptingOrders ?? false;
  return (
    <div className="space-y-5">
      <section
        className={cx('flex items-center gap-4 rounded-sheet p-5 ring-1 ring-inset', open ? 'bg-ready-tint ring-ready/20' : 'bg-prep-tint ring-prep/20')}
        aria-live="polite"
      >
        <span className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface', open ? 'text-ready' : 'text-prep')}>
          <Store className="h-6 w-6" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className={cx('text-lg font-semibold tracking-tight', open ? 'text-ready' : 'text-prep')}>{vendor ? (open ? 'Taking orders' : 'Orders paused') : 'Loading shop…'}</p>
          <p className="text-sm text-ink-2">{vendor ? (open ? `Open ${vendor.hours.open} – ${vendor.hours.close}` : 'The kitchen paused new orders. Resume from the order screen.') : ' '}</p>
        </div>
      </section>

      <section aria-labelledby="today-h">
        <h2 id="today-h" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-3">Today</h2>
        {today ? (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Sold today" value={formatPaise(today.salesPaise)} wide />
            <Stat label="Orders" value={today.orders.toLocaleString('en-IN')} />
            <Stat label="Your share" value={formatPaise(today.payablePaise)} />
          </dl>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Skeleton className="col-span-2 h-24 rounded-sheet sm:col-span-1" />
            <Skeleton className="h-24 rounded-sheet" />
            <Skeleton className="h-24 rounded-sheet" />
          </div>
        )}
      </section>

      <section aria-labelledby="now-h">
        <h2 id="now-h" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-3">In the kitchen now</h2>
        <div className="grid grid-cols-3 gap-3">
          <Count label="Waiting" n={kitchen.waiting} tone="text-accent-ink" />
          <Count label="Cooking" n={kitchen.cooking} tone="text-prep" />
          <Count label="Ready" n={kitchen.ready} tone="text-ready" />
        </div>
      </section>

      <section aria-labelledby="todo-h">
        <h2 id="todo-h" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-3">Good to know</h2>
        <ul className="space-y-2">
          <Row icon={<Wallet className="h-5 w-5" />} tone="bg-accent-tint text-accent-ink" title="Money" hint={today ? `${formatPaise(today.balanceDuePaise)} still to receive from the court` : 'Sales, past orders, payouts and what you are owed'} onClick={onOpenMoney} />
          <Row icon={<PackageX className="h-5 w-5" />} tone={soldOut ? 'bg-danger-tint text-danger' : 'bg-surface-2 text-ink-2'} title={soldOut ? `${soldOut} ${soldOut === 1 ? 'dish is' : 'dishes are'} sold out` : 'Everything is in stock'} hint="Mark dishes sold out from the order screen" />
          <Row icon={<CookingPot className="h-5 w-5" />} tone="bg-surface-2 text-ink-2" title="Menu" hint="Change dishes, prices and photos" onClick={onOpenMenu} />
        </ul>
      </section>
    </div>
  );
}

const REPORT_REFRESH_MS = 5 * 60_000;

function useToday(vendorId: string): ShopReport | null {
  const [report, setReport] = useState<ShopReport | null>(null);
  useEffect(() => {
    let live = true;
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      last = Date.now();
      const day = getIstDateKey();
      getShopReport(day, day, vendorId).then((r) => live && setReport(r)).catch(() => undefined);
    };
    // Every call runs several database queries, so: once on open, every five minutes while the page is in
    // front, and again on return only if it has been a while. Never from a tab nobody is looking at.
    const schedule = () => {
      timer = setTimeout(() => {
        if (document.visibilityState === 'visible') load();
        schedule();
      }, REPORT_REFRESH_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last > 60_000) load();
    };
    load();
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [vendorId]);
  return report;
}

function Stat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cx('rounded-sheet bg-surface p-4 shadow-card ring-1 ring-inset ring-line/70', wide && 'col-span-2 sm:col-span-1')}>
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</dd>
    </div>
  );
}

function Count({ label, n, tone }: { label: string; n: number; tone: string }) {
  return (
    <div className="rounded-sheet bg-surface p-4 text-center shadow-card ring-1 ring-inset ring-line/70">
      <p className={cx('text-3xl font-semibold tabular-nums', tone)}>{n}</p>
      <p className="mt-0.5 text-sm text-ink-3">{label}</p>
    </div>
  );
}

function Row({ icon, tone, title, hint, onClick }: { icon: ReactNode; tone: string; title: string; hint: string; onClick?: () => void }) {
  const body = (
    <>
      <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-[13px]', tone)}>{icon}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-base font-semibold text-ink">{title}</span>
        <span className="block text-sm text-ink-3">{hint}</span>
      </span>
      {onClick && <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />}
    </>
  );
  const box = 'flex w-full items-center gap-4 rounded-card bg-surface p-3 ring-1 ring-inset ring-line/60';
  return (
    <li>
      {onClick ? (
        <button type="button" onClick={onClick} className={cx(box, 'pressable transition-colors hover:bg-surface-2')}>
          {body}
        </button>
      ) : (
        <div className={box}>{body}</div>
      )}
    </li>
  );
}
