import { memo, useState } from 'react';
import { Plus } from 'lucide-react';
import { formatPaise, type MenuItem } from '@foodcourt/shared';
import { VegDot } from '@foodcourt/ui';
import { Button } from '../../components/ui/Button';
import { QtyStepper } from '../../components/ui/QtyStepper';
import { cx } from '../../lib/format';
import { useCart } from '../cart/cartStore';

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
        <p className={cx('mt-1.5 pl-6 text-base font-semibold tabular-nums', soldOut ? 'text-ink-3' : 'text-ink')}>
          {formatPaise(item.pricePaise)}
        </p>
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
