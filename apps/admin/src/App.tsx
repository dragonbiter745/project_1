import { useEffect, useState } from 'react';
import { LogOut, ShieldAlert } from 'lucide-react';
import { ActionToast, Button } from '@foodcourt/ui';
import { staffSignOut, watchStaff, type StaffUser } from '@foodcourt/firebase-client/staff';
import MoneyLogin from './login/MoneyLogin';
import { Shell } from './shell/Shell';

// One sign-in per shop opens its admin site (role vendorFinance + vendorId). The kitchen has its
// own separate login, so counter staff never see money or menu settings, and this only ever shows
// that one shop.

export default function App() {
  // undefined while Firebase restores the session, null when signed out.
  const [staff, setStaff] = useState<StaffUser | null | undefined>(undefined);
  // True from the sign-in tap until the money has flown off screen.
  const [holding, setHolding] = useState(false);
  useEffect(() => watchStaff(setStaff), []);
  if (staff === undefined) return <div className="grain min-h-[100dvh]" aria-busy="true" />;
  if (!staff || holding) return <MoneyLogin onHold={setHolding} />;
  if (staff.role !== 'vendorFinance' || !staff.vendorId) return <NoAccess staff={staff} />;
  return (
    <>
      <Shell staff={staff} vendorId={staff.vendorId} />
      <ActionToast />
    </>
  );
}

function NoAccess({ staff }: { staff: StaffUser }) {
  const kitchen = staff.role === 'vendorAdmin' || staff.role === 'vendorStaff';
  return (
    <main className="grain grid min-h-[100dvh] place-items-center px-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger-tint text-danger">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink">Shop admin login only</h1>
        <p className="mt-2 text-sm text-ink-3">
          {staff.email}{' '}
          {kitchen ? 'is a kitchen login. Use your shop’s admin login here.' : staff.role === 'master' ? 'is the court manager. Court controls are in the master console.' : 'cannot open shop admin.'}
        </p>
        <Button variant="outline" className="mt-6" onClick={() => void staffSignOut()} icon={<LogOut className="h-4 w-4" />}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
