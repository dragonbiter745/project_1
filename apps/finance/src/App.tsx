import { useEffect, useState } from 'react';
import { CalendarDays, LogOut, ShieldAlert } from 'lucide-react';
import { ActionToast, BrandMark, Button, Monogram } from '@foodcourt/ui';
import { staffSignOut, watchStaff, type StaffUser } from '@foodcourt/firebase-client/staff';
import { RangePicker, ShopFinance, presetRange, rangeLabel, type Range } from '@foodcourt/finance-ui';
import type { ShopFinance as ShopFigures } from '@foodcourt/shared';
import MoneyLogin from './login/MoneyLogin';

// Each shop's own finance login (role vendorFinance + vendorId). It is separate from the kitchen
// login, so counter staff never see money, and it only ever shows that one shop.

export default function App() {
  // undefined while Firebase restores the session, null when signed out.
  const [staff, setStaff] = useState<StaffUser | null | undefined>(undefined);
  // True from the sign-in tap until the money has flown off screen.
  const [holding, setHolding] = useState(false);
  useEffect(() => watchStaff(setStaff), []);
  if (staff === undefined) return <div className="grain min-h-[100dvh]" aria-busy="true" />;
  if (!staff || holding) return <MoneyLogin onHold={setHolding} />;
  if (staff.role !== 'vendorFinance' || !staff.vendorId) return <NoAccess staff={staff} />;
  return <Console staff={staff} vendorId={staff.vendorId} />;
}

function NoAccess({ staff }: { staff: StaffUser }) {
  const kitchen = staff.role === 'vendorAdmin' || staff.role === 'vendorStaff';
  return (
    <main className="grain grid min-h-[100dvh] place-items-center px-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger-tint text-danger">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink">Shop finance login only</h1>
        <p className="mt-2 text-sm text-ink-3">
          {staff.email} {kitchen ? 'is a kitchen login. Use your shop’s finance login here.' : staff.role === 'master' ? 'is the court manager. Court finance is in the master console.' : 'cannot open shop finance.'}
        </p>
        <Button variant="outline" className="mt-6" onClick={() => void staffSignOut()} icon={<LogOut className="h-4 w-4" />}>
          Sign out
        </Button>
      </div>
    </main>
  );
}

function Console({ staff, vendorId }: { staff: StaffUser; vendorId: string }) {
  const [range, setRange] = useState<Range>(() => presetRange('today'));
  const [shop, setShop] = useState<ShopFigures | null>(null);

  return (
    <div className="grain ambient min-h-[100dvh]">
      <header className="sticky top-0 z-header border-b border-line/70 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1320px] items-center gap-4 px-5 py-3.5 lg:px-10">
          {shop ? <Monogram code={shop.code || shop.name} tone="solid" /> : <BrandMark size="sm" />}
          <div className="min-w-0 leading-tight">
            <p className="truncate text-base font-semibold tracking-tight text-ink">{shop?.name ?? 'Your shop'}</p>
            <p className="text-xs font-medium text-ink-3">Shop finance · REVA Food Court</p>
          </div>
          <button
            type="button"
            onClick={() => void staffSignOut()}
            title={`Sign out ${staff.email ?? ''}`}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] px-5 pb-16 pt-7 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Earnings</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-3">
              <CalendarDays className="h-4 w-4" /> {rangeLabel(range)}
            </p>
          </div>
          <RangePicker value={range} onChange={setRange} />
        </div>
        <div className="mt-6">
          <ShopFinance vendorId={vendorId} range={range} onLoaded={setShop} />
        </div>
      </main>
      <ActionToast />
    </div>
  );
}
