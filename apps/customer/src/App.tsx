import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { QrCode, WifiOff } from 'lucide-react';
import { useBackDismiss } from '@foodcourt/ui';
import { warmAuthWhenIdle } from './lib/firebase';
import { DetailsSheet } from './features/auth/DetailsSheet';
import { LoginSheet } from './features/auth/LoginSheet';
import { QrWelcome } from './features/auth/QrWelcome';
import { CartBar } from './features/cart/CartBar';
import { CartSheet } from './features/cart/CartSheet';
import { CouponSheet } from './features/coupons/CouponSheet';
import { MenuScreen } from './features/menu/MenuScreen';
import { useAuth } from './lib/authStore';
import { startPush } from './features/notifications/push';
import { ORDER_MODE } from './features/session/orderMode';
import { usePickupSession } from './features/session/usePickupSession';
import { useActiveOrderSync, useCatalog, useHistorySync, useInboxSync, useProfileSync, useReturnFromPayment } from './features/session/useLiveData';
import { useTableSession, type TableSession } from './features/session/useTableSession';
import { ActiveOrderBar } from './features/tracking/ActiveOrderBar';
import { TrackingSheet } from './features/tracking/TrackingSheet';
import { AppToaster } from './features/ui/AppToaster';
import { OfflineBanner } from './features/ui/OfflineBanner';
import { useUi } from './features/ui/uiStore';
import { WebHome } from './features/web/WebHome';

// The account hub is its own chunk: it loads the first time a diner opens their account.
const AccountHub = lazy(() => import('./features/account/AccountHub'));

function LazyAccountHub({ session }: { session: TableSession | null }) {
  const open = useUi((s) => s.open.account);
  const [wanted, setWanted] = useState(open);
  if (open && !wanted) setWanted(true);
  if (!wanted) return null;
  return (
    <Suspense fallback={null}>
      <AccountHub session={session} />
    </Suspense>
  );
}

export default function App() {
  useCatalog();
  useActiveOrderSync();
  useHistorySync();
  useProfileSync();
  useInboxSync();
  useReturnFromPayment();
  const uid = useAuth((s) => s.user?.uid ?? null);

  useEffect(() => {
    warmAuthWhenIdle();
    // A tap on an offer notification lands on /?inbox=…: open the account at the inbox.
    const params = new URLSearchParams(window.location.search);
    if (params.has('inbox')) {
      useUi.getState().showHub('inbox');
      params.delete('inbox');
      const rest = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
    }
  }, []);

  useEffect(() => startPush(uid), [uid]);

  return ORDER_MODE === 'table' ? <TableApp /> : <WebApp />;
}

/** Scanned at a table: the menu straight away, guests welcome. */
function TableApp() {
  const state = useTableSession();
  if (state.status === 'unknown-table') return <UnknownTable code={state.code} />;
  if (state.status === 'error') return <SessionError retry={state.retry} />;
  if (state.status === 'loading') return null;

  const { session } = state;
  return (
    <div className="mx-auto min-h-[100dvh] max-w-md md:border-x md:border-line">
      <MenuScreen session={session} />
      <QrWelcome session={session} />
      <Layers session={session} />
    </div>
  );
}

/** The website: restaurants first, then a shop's menu; ordering needs an account. */
function WebApp() {
  const session = usePickupSession();
  const [shopId, setShopId] = useState<string | null>(null);
  const wasOpen = useRef(false);

  // The back gesture returns to the restaurant list instead of leaving the site.
  useBackDismiss(shopId !== null, () => setShopId(null));

  useEffect(() => {
    if (shopId) window.scrollTo({ top: 0, behavior: 'instant' });
    else if (wasOpen.current) document.getElementById('restaurants')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    wasOpen.current = shopId !== null;
  }, [shopId]);

  return (
    <>
      {shopId ? (
        <div className="mx-auto min-h-[100dvh] max-w-2xl md:border-x md:border-line">
          <MenuScreen key={shopId} session={session} initialVendorId={shopId} onBack={() => setShopId(null)} />
        </div>
      ) : (
        <WebHome onOpenShop={setShopId} />
      )}
      <Layers session={session} />
    </>
  );
}

/** Bars and sheets shared by both ways of ordering. */
function Layers({ session }: { session: TableSession | null }) {
  return (
    <>
      <ActiveOrderBar />
      <CartBar />
      <CartSheet session={session} />
      <TrackingSheet session={session} />
      <LoginSheet session={session} />
      <DetailsSheet session={session} />
      <CouponSheet />
      <LazyAccountHub session={session} />
      <OfflineBanner />
      <AppToaster />
    </>
  );
}

function UnknownTable({ code }: { code: string }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-8 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-surface text-ink-2 ring-1 ring-inset ring-line">
        <QrCode className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink">We couldn't find this table</h1>
      <p className="mt-2 text-base text-ink-3">
        {code ? 'This table code is no longer active.' : 'This link is missing its table code.'} Scan the QR code on your
        table again, or ask the counter for help.
      </p>
      <a href="/" className="pressable mt-6 inline-flex h-12 items-center rounded-full bg-ink px-6 text-sm font-semibold text-surface">
        Order online for pickup
      </a>
    </main>
  );
}

function SessionError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-8 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-surface text-ink-2 ring-1 ring-inset ring-line">
        <WifiOff className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink">We couldn't reach the court</h1>
      <p className="mt-2 text-base text-ink-3">Check your connection and try again. Your table is still yours.</p>
      <button type="button" onClick={retry} className="pressable mt-6 h-12 rounded-full bg-ink px-6 text-sm font-semibold text-surface">
        Try again
      </button>
    </main>
  );
}
