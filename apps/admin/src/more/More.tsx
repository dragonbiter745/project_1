import { LogOut } from 'lucide-react';
import { Button } from '@foodcourt/ui';
import { staffSignOut, type StaffUser } from '@foodcourt/firebase-client/staff';

/** Account and, in later slices, shop settings, staff and the kitchen login. */
export function More({ staff }: { staff: StaffUser }) {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">More</h1>
      <section className="rounded-sheet bg-surface p-5 shadow-card ring-1 ring-inset ring-line/70">
        <p className="text-sm text-ink-3">Signed in as</p>
        <p className="mt-0.5 break-all text-base font-semibold text-ink">{staff.email}</p>
        <Button variant="outline" className="mt-4 w-full sm:w-auto" onClick={() => void staffSignOut()} icon={<LogOut className="h-4 w-4" />}>
          Sign out
        </Button>
      </section>
    </div>
  );
}
