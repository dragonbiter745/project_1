import { useEffect, useState } from 'react';
import { LogOut, ShieldAlert } from 'lucide-react';
import { ActionToast, Button, PauseSheet, StaffLogin, run, useNow, useWakeLock } from '@foodcourt/ui';
import { connectVendor } from '@foodcourt/firebase-client/live';
import { loadCatalog } from '@foodcourt/firebase-client/rest';
import { staffSignIn, staffSignOut, watchStaff, type StaffUser } from '@foodcourt/firebase-client/staff';
import { pauseOrders, resumeOrders } from '@foodcourt/firebase-client/ops';
import { Board } from './features/board/Board';

import { MoreSheet } from './features/controls/MoreSheet';
import { StockSheet } from './features/controls/StockSheet';
import { TodaySheet } from './features/controls/TodaySheet';
import { TopBar } from './features/controls/TopBar';
import { ShopPicker } from './features/shop/ShopPicker';
import { StartOverlay } from './features/shop/StartOverlay';
import { useIsPhone } from './lib/device';
import { unlockAudio } from './lib/sound';
import { jsonEqual, useLocal, useSyncStatus } from './lib/store';

const SHOP_KEY = 'fc_vendor_shop';

function readShop(): string | null {
  const code = new URLSearchParams(window.location.search).get('shop');
  if (code) return `code:${code.toUpperCase()}`;
  try {
    return localStorage.getItem(SHOP_KEY);
  } catch {
    return null;
  }
}

function saveShop(vendorId: string | null) {
  try {
    if (vendorId) localStorage.setItem(SHOP_KEY, vendorId);
    else localStorage.removeItem(SHOP_KEY);
  } catch {
    // storage blocked; the picker will show again next load
  }
}

export default function App() {
  // undefined while Firebase restores the session, null when signed out.
  const [staff, setStaff] = useState<StaffUser | null | undefined>(undefined);
  useEffect(() => watchStaff(setStaff), []);

  if (staff === undefined) return <div className="grain ambient min-h-[100dvh]" aria-busy="true" />;
  if (!staff) return <StaffLogin title="Kitchen sign-in" subtitle="Use the login for your shop. Orders for your kitchen appear the moment diners pay." onSubmit={staffSignIn} />;
  if (staff.role !== 'master' && !staff.vendorId) return <NoAccess email={staff.email} />;
  return <Kitchen staff={staff} />;
}

function NoAccess({ email }: { email: string | null }) {
  return (
    <main className="grain ambient grid min-h-[100dvh] place-items-center px-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger-tint text-danger">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink">This account has no kitchen</h1>
        <p className="mt-2 text-sm text-ink-3">{email} is signed in but not linked to a shop. Ask the court manager to set it up.</p>
        <Button variant="outline" className="mt-6" onClick={() => void staffSignOut()} icon={<LogOut className="h-4 w-4" />}>
          Sign out
        </Button>
      </div>
    </main>
  );
}

function Kitchen({ staff }: { staff: StaffUser }) {
  const isMaster = staff.role === 'master';
  const vendors = useLocal((s) => s.vendors, jsonEqual);
  // Kitchen accounts are bound to their own shop; only the court master may pick one.
  const [shopRef, setShopRef] = useState<string | null>(() => (isMaster ? readShop() : staff.vendorId));
  const vendorId = isMaster ? (shopRef?.startsWith('code:') ? vendors.find((v) => v.code === shopRef.slice(5))?.id ?? null : shopRef) : staff.vendorId;
  const vendor = vendors.find((v) => v.id === vendorId);

  useEffect(() => {
    if (isMaster && !vendorId) void loadCatalog();
  }, [isMaster, vendorId]);
  useEffect(() => (vendorId ? connectVendor(vendorId) : undefined), [vendorId]);
  const soldOutCount = useLocal((s) => (vendor ? Object.keys(s.availability[vendor.id]?.unavailable ?? {}).length : 0));
  const sync = useSyncStatus();
  const [started, setStarted] = useState(false);
  const [alarmOn, setAlarmOn] = useState(true);
  const [sheet, setSheet] = useState<'stock' | 'pause' | 'today' | 'more' | null>(null);
  const phone = useIsPhone();
  const now = useNow(15_000, Boolean(vendor && !vendor.acceptingOrders));

  useWakeLock(started && Boolean(vendor));

  // Timed pauses end on their own (PRD FR-V3 auto-resume).
  useEffect(() => {
    if (vendor && !vendor.acceptingOrders && vendor.pausedUntil && now >= Date.parse(vendor.pausedUntil)) {
      void run(resumeOrders(vendor.id));
    }
  }, [vendor, now]);

  if (!vendorId && isMaster) {
    return (
      <ShopPicker
        onPick={(id) => {
          saveShop(id);
          setShopRef(id);
        }}
      />
    );
  }
  if (!vendor) return <div className="grain ambient min-h-[100dvh]" aria-busy="true" />;

  const switchShop = () => {
    setStarted(false);
    setSheet(null);
    if (!isMaster) {
      void staffSignOut();
      return;
    }
    saveShop(null);
    setShopRef(null);
  };

  return (
    <div className="grain ambient flex h-[100dvh] flex-col">
      <TopBar
        phone={phone}
        vendor={vendor}
        sync={sync}
        alarmOn={alarmOn}
        soldOutCount={soldOutCount}
        onToggleAlarm={() => setAlarmOn((on) => !on)}
        onOpenStock={() => setSheet('stock')}
        onOpenToday={() => setSheet('today')}
        onPause={() => setSheet('pause')}
        onResume={() => void run(resumeOrders(vendor.id))}
        onSwitchShop={switchShop}
        exitLabel={isMaster ? 'Switch shop' : 'Sign out'}
      />
      <Board
        vendorId={vendor.id}
        alarmOn={started && alarmOn}
        phone={phone}
        onMore={() => setSheet('more')}
        moreAlert={!vendor.acceptingOrders || !alarmOn || soldOutCount > 0}
      />

      <MoreSheet
        vendor={vendor}
        open={sheet === 'more'}
        alarmOn={alarmOn}
        soldOutCount={soldOutCount}
        onClose={() => setSheet(null)}
        onToday={() => setSheet('today')}
        onStock={() => setSheet('stock')}
        onPause={() => setSheet('pause')}
        onResume={() => void run(resumeOrders(vendor.id))}
        onToggleAlarm={() => setAlarmOn((on) => !on)}
        onSwitchShop={switchShop}
        exitLabel={isMaster ? 'Switch shop' : 'Sign out'}
      />

      <StockSheet vendorId={vendor.id} open={sheet === 'stock'} onClose={() => setSheet(null)} />
      <TodaySheet vendor={vendor} open={sheet === 'today'} onClose={() => setSheet(null)} />
      <PauseSheet
        shopName={vendor.name}
        open={sheet === 'pause'}
        onClose={() => setSheet(null)}
        onPause={(until) => {
          void run(pauseOrders(vendor.id, until));
          setSheet(null);
        }}
      />

      {!started && (
        <StartOverlay
          shopName={vendor.name}
          onStart={() => {
            unlockAudio();
            setStarted(true);
          }}
        />
      )}
      <ActionToast />
    </div>
  );
}
