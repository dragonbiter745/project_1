import { memo, useState } from 'react';
import { Heart, Plus } from 'lucide-react';
import { favouriteKey, formatPaise, type MenuItem } from '@foodcourt/shared';
import { Button, QtyStepper, VegDot } from '@foodcourt/ui';
import { useAuth } from '../../lib/authStore';
import { cx, prefersReducedMotion } from '../../lib/format';
import { useLocal } from '../../lib/store';
import { notifyError } from '../../lib/toast';
import { toggleFavourite } from '../auth/account';
import { useCart } from '../cart/cartStore';
import { useUi } from '../ui/uiStore';

// One Set per favourites array, shared by every row, so a menu of hundreds of rows stays cheap.
const sets = new WeakMap<string[], Set<string>>();
const EMPTY: string[] = [];
function asSet(list: string[]): Set<string> {
  let set = sets.get(list);
  if (!set) sets.set(list, (set = new Set(list)));
  return set;
}

export function FavouriteButton({ vendorId, itemId, name }: { vendorId: string; itemId: string; name: string }) {
  const member = useAuth((s) => Boolean(s.user?.member));
  const key = favouriteKey(vendorId, itemId);
  const saved = useLocal((s) => {
    const uid = useAuth.getState().user?.uid;
    return asSet((uid && s.users[uid]?.favourites) || EMPTY).has(key);
  });
  const showLogin = useUi((s) => s.showLogin);

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!member) {
      showLogin('Sign in to save your favourite dishes.');
      return;
    }
    if (!saved && !prefersReducedMotion()) {
      e.currentTarget.firstElementChild?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], {
        duration: 320,
        easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      });
    }
    toggleFavourite(vendorId, itemId, !saved).catch((err: unknown) =>
      notifyError("Couldn't update favourites", { description: (err as Error).message || 'Try again.' })
    );
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from favourites` : `Save ${name} to favourites`}
      className="-my-2 grid h-10 w-10 place-items-center rounded-full"
    >
      <Heart
        className={cx('h-[18px] w-[18px] transition-colors duration-200', saved ? 'fill-accent text-accent' : 'text-ink-3')}
        strokeWidth={1.75}
      />
    </button>
  );
}

interface ItemRowProps {
  item: MenuItem;
  vendorId: string;
  soldOut: boolean;
  paused: boolean;
}

// Each row subscribes to its own cart quantity, so adding one item re-renders one row.
export const ItemRow = memo(function ItemRow({ item, vendorId, soldOut, paused }: ItemRowProps) {
  const qty = useCart((s) => s.items[item.id]?.qty ?? 0);
  const add = useCart((s) => s.add);
  const decrement = useCart((s) => s.decrement);
  const inCart = qty > 0;
  // The stepper mounts on first add (then stays for the crossfade), keeping ~700 hidden
  // nodes out of a full menu's DOM.
  const [stepperMounted, setStepperMounted] = useState(inCart);
  if (inCart && !stepperMounted) setStepperMounted(true);

  return (
    <li className="flex items-start gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2.5">
          <VegDot veg={item.veg} size="sm" className="mt-[3px] shrink-0" />
          <h3 className={cx('text-base font-medium leading-snug [overflow-wrap:anywhere]', soldOut ? 'text-ink-3' : 'text-ink')}>{item.name}</h3>
        </div>
        {item.desc && <p className="mt-1 line-clamp-2 pl-6 text-sm text-ink-3">{item.desc}</p>}
        <div className="mt-0.5 flex items-center gap-1 pl-6">
          <p className={cx('text-base font-semibold tabular-nums', soldOut ? 'text-ink-3' : 'text-ink')}>{formatPaise(item.pricePaise)}</p>
          <FavouriteButton vendorId={vendorId} itemId={item.id} name={item.name} />
        </div>
      </div>

      {soldOut ? (
        <span className="mt-2.5 shrink-0 text-sm font-medium text-ink-3">Sold out</span>
      ) : (
        <div className="relative h-11 w-[108px] shrink-0">
          <div className="swap-layer absolute inset-0" data-active={!inCart} inert={inCart}>
            <Button
              variant="tint"
              block
              disabled={paused}
              onClick={() => add(item, vendorId)}
              aria-label={`Add ${item.name}`}
              icon={<Plus className="h-4 w-4" strokeWidth={2.25} />}
            >
              Add
            </Button>
          </div>
          {stepperMounted && (
            <div className="swap-layer absolute inset-0" data-active={inCart} inert={!inCart}>
              <QtyStepper
                qty={Math.max(qty, 1)}
                itemName={item.name}
                onIncrement={() => add(item, vendorId)}
                onDecrement={() => decrement(item.id)}
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
});
