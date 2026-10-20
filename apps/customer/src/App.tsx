import { Suspense, lazy, useEffect, useState } from 'react';
import { QrCode, WifiOff } from 'lucide-react';
import { warmAuthWhenIdle } from './lib/firebase';
import { DetailsSheet } from './features/auth/DetailsSheet';
import { LoginSheet } from './features/auth/LoginSheet';
import { CartBar } from './features/cart/CartBar';
import { CartSheet } from './features/cart/CartSheet';
import { CouponSheet } from './features/coupons/CouponSheet';
import { MenuScreen } from './features/menu/MenuScreen';
import { useAuth } from './lib/authStore';
import { startPush } from './features/notifications/push';
import { useActiveOrderSync, useCatalog, useHistorySync, useInboxSync, useProfileSync, useReturnFromPayment } from './features/session/useLiveData';
import { useTableSession, type TableSession } from './features/session/useTableSession';
import { ActiveOrderBar } from './features/tracking/ActiveOrderBar';
import { TrackingSheet } from './features/tracking/TrackingSheet';
import { AppToaster } from './features/ui/AppToaster';
import { OfflineBanner } from './features/ui/OfflineBanner';
import { useUi } from './features/ui/uiStore';

// The account hub is its own chunk: it loads the first time a diner opens their account.
const AccountHub = lazy(() => import('./features/account/AccountHub'));

function LazyAccountHub({ session }: { session: TableSession }) {
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
  const state = useTableSession();
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

  if (state.status === 'unknown-table') return <UnknownTable code={state.code} />;
  if (state.status === 'error') return <SessionError retry={state.retry} />;
  if (state.status === 'loading') return null;

  const { session } = state;
  return (
    <div className="mx-auto min-h-[100dvh] max-w-md md:border-x md:border-line">
      <MenuScreen session={session} />
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
    </div>
  );
}

function UnknownTable({ code }: { code: string }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-8 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-ink-2">
        <QrCode className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink">We couldn't find this table</h1>
      <p className="mt-2 text-base text-ink-3">
        {code ? 'This table code is no longer active.' : 'This link is missing its table code.'} Scan the QR code on your
        table again, or ask the counter for help.
      </p>
    </main>
  );
}

function SessionError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-8 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-ink-2">
        <WifiOff className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink">We couldn't reach the court</h1>
      <p className="mt-2 text-base text-ink-3">Check your connection and try again. Your table is still yours.</p>
      <button type="button" onClick={retry} className="pressable mt-6 h-12 rounded-full bg-ink px-6 text-sm font-semibold text-white">
        Try again
      </button>
    </main>
  );
}
