import { useState } from 'react';
import { BellRing, Heart, ReceiptText, TicketPercent } from 'lucide-react';
import { notify, notifyError } from '../../lib/toast';
import type { TableSession } from '../session/useTableSession';
import { useUi } from '../ui/uiStore';
import { SignInCancelled, signInErrorMessage, signInWithGoogle } from './account';
import { Button, Sheet } from '@foodcourt/ui';

const PERKS = [
  { icon: ReceiptText, title: 'Every order, on any phone', text: 'Receipts, refunds and one-tap reorder.' },
  { icon: Heart, title: 'Your favourite dishes', text: 'Save them once, find them at every visit.' },
  { icon: TicketPercent, title: 'Coupons as they launch', text: 'Signed-in diners hear about offers first.' },
  { icon: BellRing, title: 'Know when food is ready', text: 'Order updates on this phone.' },
];

/** Google's mark, drawn to their brand guidelines (it cannot come from an icon set). */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

async function celebrate() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const { default: confetti } = await import('canvas-confetti');
  void confetti({ particleCount: 70, spread: 70, startVelocity: 32, origin: { y: 0.75 }, colors: ['#E4570F', '#F9D6C2', '#15803D', '#FFFFFF'], disableForReducedMotion: true });
}

export function LoginSheet({ session }: { session: TableSession }) {
  const open = useUi((s) => s.open.login);
  const reason = useUi((s) => s.loginReason);
  const hide = useUi((s) => s.hide);
  const [pending, setPending] = useState(false);
  const close = () => hide('login');

  const signIn = async () => {
    if (pending) return;
    setPending(true);
    try {
      const { firstSignIn, merged, profile } = await signInWithGoogle(session.id);
      close();
      const first = profile.name?.split(' ')[0];
      void celebrate();
      notify(first ? `You're in, ${first}` : "You're in", {
        description: firstSignIn
          ? 'Coupons you get will show up in your account.'
          : merged > 0
            ? `${merged === 1 ? 'Your order from this phone is' : `${merged} orders from this phone are`} now in your account.`
            : 'Your orders and favourites are here.',
      });
    } catch (err) {
      if (err instanceof SignInCancelled) return;
      console.error('Google sign-in failed', err);
      notifyError("Couldn't sign you in", { description: signInErrorMessage(err) });
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Sign in"
      description={reason ?? 'Optional. Ordering as a guest still works.'}
      footer={
        <div className="space-y-1">
          <Button size="lg" variant="outline" block loading={pending} onClick={() => void signIn()} icon={<GoogleMark />}>
            Continue with Google
          </Button>
          <Button variant="ghost" block onClick={close}>
            Not now
          </Button>
        </div>
      }
    >
      <div className="overflow-hidden rounded-card bg-accent-tint ring-1 ring-inset ring-accent-line">
        <div className="px-4 pb-3 pt-4">
          <p className="text-lg font-semibold tracking-tight text-ink">Your REVA account</p>
          <p className="mt-0.5 text-sm text-ink-2">One tap with Google. This table, your cart and today's orders stay as they are.</p>
        </div>
        <ul className="divide-y divide-accent-line/60 border-t border-accent-line/60 bg-surface/70">
          {PERKS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="enter-up flex items-start gap-3 px-4 py-3" style={{ ['--i' as string]: i }}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-accent-ink ring-1 ring-inset ring-accent-line">
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-medium text-ink">{title}</span>
                <span className="block text-sm text-ink-3">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-xs text-ink-3">
        We use your Google name, email and photo for your account and nothing else. You can delete your account any time
        from Privacy in your account.
      </p>
    </Sheet>
  );
}
