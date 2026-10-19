import { useEffect, useState } from 'react';
import { useNow, useWakeLock } from '@foodcourt/ui';
import { Board } from './features/board/Board';
import { PauseSheet } from './features/controls/PauseSheet';
import { StockSheet } from './features/controls/StockSheet';
import { TopBar } from './features/controls/TopBar';
import { ShopPicker } from './features/shop/ShopPicker';
import { StartOverlay } from './features/shop/StartOverlay';
import { pauseOrders, resumeOrders } from './lib/kitchen';
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
  const [sheet, setSheet] = useState<'stock' | 'pause' | null>(null);
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

  return (
    <div className="flex h-[100dvh] flex-col">
      <TopBar
        vendor={vendor}
        sync={sync}
        alarmOn={alarmOn}
        soldOutCount={soldOutCount}
        onToggleAlarm={() => setAlarmOn((on) => !on)}
        onOpenStock={() => setSheet('stock')}
        onPause={() => setSheet('pause')}
        onResume={() => resumeOrders(vendor.id)}
        onSwitchShop={() => {
          saveShop(null);
          setShopRef(null);
          setStarted(false);
        }}
      />
      <Board vendorId={vendor.id} alarmOn={started && alarmOn} />

      <StockSheet vendorId={vendor.id} open={sheet === 'stock'} onClose={() => setSheet(null)} />
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
