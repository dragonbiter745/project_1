import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { getIstDateKey } from '@foodcourt/shared';
import { useAuth } from '../../lib/authStore';
import { notifyError } from '../../lib/toast';
import type { TableSession } from '../session/useTableSession';
import { useUi } from '../ui/uiStore';
import { SignInCancelled, signInErrorMessage, signInWithGoogle } from './account';
import { GoogleMark, welcomeBack } from './LoginSheet';
import { PerkList } from './perks';
import { Button, Sheet } from '@foodcourt/ui';

const KEY = 'fc_qr_welcome';

function seenToday(): boolean {
  try {
    return localStorage.getItem(KEY) === getIstDateKey();
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(KEY, getIstDateKey());
  } catch {
    // storage blocked: it may show again on the next scan
  }
}

/**
 * The first thing a guest sees after scanning a table: order as a guest straight away, or take an
 * account for member coupons. Once a day per phone; signed-in diners never see it.
 */
export function QrWelcome({ session }: { session: TableSession }) {
  const user = useAuth((s) => s.user);
  const showLogin = useUi((s) => s.showLogin);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  // Waits for auth to settle so a returning member is never asked.
  useEffect(() => {
    if (user && !user.member && !seenToday()) setOpen(true);
    if (user?.member) setOpen(false);
  }, [user]);

  const close = () => {
    markSeen();
    setOpen(false);
  };

  const google = async () => {
    if (pending) return;
    setPending(true);
    try {
      welcomeBack(await signInWithGoogle(session.id), close);
    } catch (err) {
      if (err instanceof SignInCancelled) return;
      console.error('Google sign-in failed', err);
      notifyError("Couldn't sign you in", { description: signInErrorMessage(err) });
    } finally {
      setPending(false);
    }
  };

  const email = () => {
    close();
    // The welcome sheet's history entry must clear before the next sheet adds its own.
    setTimeout(() => showLogin(undefined, { mode: 'signup' }), 320);
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Welcome to Qrave"
      description={`Table ${session.tableLabel}. Order from every shop in one cart.`}
      footer={
        <div className="space-y-2 pb-1">
          <Button size="lg" variant="outline" block loading={pending} onClick={() => void google()} icon={<GoogleMark />}>
            Continue with Google
          </Button>
          <Button size="lg" block onClick={email} icon={<UserRound className="h-[18px] w-[18px]" strokeWidth={1.75} />}>
            Log in or sign up
          </Button>
          <Button variant="ghost" block onClick={close}>
            Continue as guest
          </Button>
        </div>
      }
    >
      <div className="rounded-[24px] bg-ink px-5 py-5 text-surface">
        <p className="max-w-[16ch] font-display text-[30px] font-bold leading-[0.98]">
          Members get <span className="text-accent-tint">more.</span>
        </p>
        <p className="mt-2 text-sm text-surface/75">Coupons and rewards kept in your account. Guests can order and pay exactly the same way.</p>
      </div>
      <PerkList className="mt-5" />
    </Sheet>
  );
}
