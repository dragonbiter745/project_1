import { useState } from 'react';
import { Sparkles, TicketPercent, X } from 'lucide-react';
import { getIstDateKey } from '@foodcourt/shared';
import { selectMember, useAuth } from '../../lib/authStore';
import { cx } from '../../lib/format';
import { useUi } from '../ui/uiStore';
import { Button } from '@foodcourt/ui';

type Place = 'menu' | 'cart' | 'tracking';

// No amounts: offers are not decided yet, so the copy only promises that coupons are coming.
const COPY: Record<Place, { title: string; text: string; reason: string }> = {
  menu: {
    title: 'Coupons are on the way',
    text: 'Sign in to get coupons and offers as they launch.',
    reason: 'Signed-in diners get coupons and offers first.',
  },
  cart: {
    title: 'Make this order count',
    text: 'Sign in so this order counts toward future coupons.',
    reason: 'This order will count toward future coupons.',
  },
  tracking: {
    title: 'This order still counts',
    text: "Sign in now and you'll be first to hear about offers.",
    reason: 'Your order stays exactly as it is.',
  },
};

const MENU_KEY = 'fc_nudge_menu_dismissed';

function dismissedToday(): boolean {
  try {
    return localStorage.getItem(MENU_KEY) === getIstDateKey();
  } catch {
    return false;
  }
}

/** A small invitation to sign in, for guests only. The menu one can be closed for the day. */
export function SignInNudge({ place, className }: { place: Place; className?: string }) {
  const member = useAuth(selectMember);
  const showLogin = useUi((s) => s.showLogin);
  const [hidden, setHidden] = useState(() => place === 'menu' && dismissedToday());
  if (member || hidden) return null;
  const copy = COPY[place];

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(MENU_KEY, getIstDateKey());
    } catch {
      // storage blocked: hidden until the page reloads
    }
  };

  if (place === 'menu') {
    return (
      <div
        className={cx(
          'enter-down relative flex items-center gap-3 overflow-hidden rounded-card bg-gradient-to-r from-accent-tint via-accent-tint to-surface py-3 pl-3.5 pr-2 ring-1 ring-inset ring-accent-line',
          className
        )}
      >
        <span className="nudge-shine grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-accent-ink ring-1 ring-inset ring-accent-line" aria-hidden>
          <TicketPercent className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{copy.title}</p>
          <p className="text-sm text-ink-2">{copy.text}</p>
        </div>
        <Button size="sm" variant="accent" onClick={() => showLogin(copy.reason)}>
          Sign in
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide for today"
          className="pressable grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3 hover:text-ink"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <div className={cx('flex items-center justify-between gap-3 rounded-card bg-accent-tint/60 p-4 ring-1 ring-inset ring-accent-line', className)}>
      <p className="flex min-w-0 items-start gap-2.5 text-sm text-ink-2">
        <Sparkles className="mt-0.5 h-[18px] w-[18px] shrink-0 text-accent-ink" strokeWidth={1.75} />
        <span>
          <span className="block font-semibold text-ink">{copy.title}</span>
          {copy.text}
        </span>
      </p>
      <Button variant="tint" size="sm" onClick={() => showLogin(copy.reason)}>
        Sign in
      </Button>
    </div>
  );
}
