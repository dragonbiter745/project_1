import { useEffect, useState } from 'react';
import { PauseSheet, useNow, useWakeLock } from '@foodcourt/ui';
import { Board } from './features/board/Board';

import { MoreSheet } from './features/controls/MoreSheet';
import { StockSheet } from './features/controls/StockSheet';
import { TodaySheet } from './features/controls/TodaySheet';
import { TopBar } from './features/controls/TopBar';
import { ShopPicker } from './features/shop/ShopPicker';
import { StartOverlay } from './features/shop/StartOverlay';
import { pauseOrders, resumeOrders } from '@foodcourt/firebase-client/local-ops';
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
  const vendors = useLocal((s) => s.vendors, jsonEqual);
  const [shopRef, setShopRef] = useState<string | null>(readShop);
  const vendor = vendors.find((v) => (shopRef?.startsWith('code:') ? v.code === shopRef.slice(5) : v.id === shopRef));
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
      resumeOrders(vendor.id);
    }
  }, [vendor, now]);

  if (!vendor) {
    return (
      <ShopPicker
        onPick={(id) => {
          saveShop(id);
          setShopRef(id);
        }}
      />
    );
  }

  const switchShop = () => {
    saveShop(null);
    setShopRef(null);
    setStarted(false);
    setSheet(null);
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
        onResume={() => resumeOrders(vendor.id)}
        onSwitchShop={switchShop}
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
        onResume={() => resumeOrders(vendor.id)}
        onToggleAlarm={() => setAlarmOn((on) => !on)}
        onSwitchShop={switchShop}
      />

      <StockSheet vendorId={vendor.id} open={sheet === 'stock'} onClose={() => setSheet(null)} />
      <TodaySheet vendor={vendor} open={sheet === 'today'} onClose={() => setSheet(null)} />
      <PauseSheet
        shopName={vendor.name}
        open={sheet === 'pause'}
        onClose={() => setSheet(null)}
        onPause={(until) => {
          pauseOrders(vendor.id, until);
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
    </div>
  );
}
