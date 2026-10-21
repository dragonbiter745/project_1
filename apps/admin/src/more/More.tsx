import { useState, type ReactNode } from 'react';
import { ChevronRight, KeyRound, LogOut, Store } from 'lucide-react';
import { Button, Monogram, cx } from '@foodcourt/ui';
import { staffSignOut, type StaffUser } from '@foodcourt/firebase-client/staff';
import { useLocal } from '../lib/store';
import { KitchenPasswordSheet } from './KitchenPasswordSheet';
import { ShopDetailsSheet } from './ShopDetailsSheet';

/** Shop settings, the kitchen login's password, and the account. */
export function More({ staff, vendorId }: { staff: StaffUser; vendorId: string }) {
  const vendor = useLocal((s) => s.vendors.find((v) => v.id === vendorId) ?? null);
  const [details, setDetails] = useState({ open: false, seq: 0 });
  const [password, setPassword] = useState({ open: false, seq: 0 });
  const show = (set: typeof setDetails) => set((s) => ({ open: true, seq: s.seq + 1 }));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">More</h1>

      <ul className="space-y-2">
        <Row
          icon={vendor ? <Monogram code={vendor.code} /> : <Store className="h-5 w-5" />}
          tone={vendor ? '' : 'bg-surface-2 text-ink-2'}
          title="Shop details"
          hint={vendor ? `Logo, hours ${vendor.hours.open}–${vendor.hours.close}, preparation time` : 'Loading…'}
          onClick={vendor ? () => show(setDetails) : undefined}
        />
        <Row icon={<KeyRound className="h-5 w-5" />} tone="bg-accent-tint text-accent-ink" title="Kitchen password" hint="Change the password of the order screen login" onClick={() => show(setPassword)} />
      </ul>

      <section className="rounded-sheet bg-surface p-5 shadow-card ring-1 ring-inset ring-line/70">
        <p className="text-sm text-ink-3">Signed in as</p>
        <p className="mt-0.5 break-all text-base font-semibold text-ink">{staff.email}</p>
        <Button variant="outline" className="mt-4 w-full sm:w-auto" onClick={() => void staffSignOut()} icon={<LogOut className="h-4 w-4" />}>
          Sign out
        </Button>
      </section>

      {vendor && <ShopDetailsSheet open={details.open} seq={details.seq} vendor={vendor} onClose={() => setDetails((s) => ({ ...s, open: false }))} />}
      <KitchenPasswordSheet open={password.open} seq={password.seq} onClose={() => setPassword((s) => ({ ...s, open: false }))} />
    </div>
  );
}

function Row({ icon, tone, title, hint, onClick }: { icon: ReactNode; tone: string; title: string; hint: string; onClick?: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className="pressable flex w-full items-center gap-4 rounded-card bg-surface p-3 text-left ring-1 ring-inset ring-line/60 transition-colors hover:bg-surface-2"
      >
        <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-[13px]', tone)}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-ink">{title}</span>
          <span className="block text-sm text-ink-3">{hint}</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
      </button>
    </li>
  );
}
