import { useEffect } from 'react';
import { QrCode } from 'lucide-react';
import { warmAuthWhenIdle } from './lib/firebase';
import { AccountSheet } from './features/account/AccountSheet';
import { LoginSheet } from './features/auth/LoginSheet';
import { CartBar } from './features/cart/CartBar';
import { CartSheet } from './features/cart/CartSheet';
import { MenuScreen } from './features/menu/MenuScreen';
import { useTableSession } from './features/session/useTableSession';
import { ActiveOrderBar } from './features/tracking/ActiveOrderBar';
import { TrackingSheet } from './features/tracking/TrackingSheet';
import { AppToaster } from './features/ui/AppToaster';
import { OfflineBanner } from './features/ui/OfflineBanner';

export default function App() {
  const state = useTableSession();

  useEffect(() => {
    warmAuthWhenIdle();
  }, []);

  if (state.status === 'unknown-table') return <UnknownTable code={state.code} />;
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
      <AccountSheet session={session} />
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
        {code ? `The code ${code} isn't active.` : 'This link is missing a table code.'} Scan the QR code on your table
        again, or ask the counter for help.
      </p>
    </main>
  );
}
