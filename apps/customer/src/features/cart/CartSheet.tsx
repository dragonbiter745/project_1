import { useEffect, useMemo, useState } from 'react';
import { Gift, NotebookPen, ShoppingBag } from 'lucide-react';
import { calculatePointsEarned, computeOrderTotals, formatPaise, type CartItem } from '@foodcourt/shared';
import { VegDot } from '@foodcourt/ui';
import { Button } from '../../components/ui/Button';
import { QtyStepper } from '../../components/ui/QtyStepper';
import { Sheet } from '../../components/ui/Sheet';
import { jsonEqual, useLocal } from '../../lib/store';
import { useProfile } from '../auth/profileStore';
import { preloadCheckout, useCheckout } from '../checkout/useCheckout';
import type { TableSession } from '../session/useTableSession';
import { useUi } from '../ui/uiStore';
import { useCart } from './cartStore';

export function CartSheet({ session }: { session: TableSession }) {
  const open = useUi((s) => s.open.cart);
  const hide = useUi((s) => s.hide);
  const show = useUi((s) => s.show);
  const items = useCart((s) => s.items);
  const add = useCart((s) => s.add);
  const decrement = useCart((s) => s.decrement);
  const setNote = useCart((s) => s.setNote);
  const vendors = useLocal((s) => s.vendors, jsonEqual);
  const config = useLocal((s) => s.config, jsonEqual);
  const profile = useProfile((s) => s.profile);
  const { checkout, pending } = useCheckout(session);

  const list = useMemo(() => Object.values(items), [items]);
  const totals = useMemo(() => computeOrderTotals({ items: list, config }), [list, config]);
  const points = calculatePointsEarned(totals.subtotalPaise, config.pointsPerRupee);
  const groups = vendors
    .map((vendor) => ({ vendor, items: list.filter((i) => i.vendorId === vendor.id) }))
    .filter((g) => g.items.length > 0);

  // Warm the payment SDK and Functions while the diner reviews the cart.
  useEffect(() => {
    if (open) preloadCheckout();
  }, [open]);

  const close = () => hide('cart');

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Your order"
      description={`Table ${session.tableLabel} · One payment for every shop`}
      footer={
        list.length > 0 ? (
          <Button size="lg" block loading={pending} onClick={() => checkout(list, totals)}>
            Pay {formatPaise(totals.totalPaise)}
          </Button>
        ) : undefined
      }
    >
      {list.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-ink-3">
            <ShoppingBag className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <p className="mt-4 text-base font-semibold text-ink">Your cart is empty</p>
          <p className="mt-1 text-sm text-ink-3">Add dishes from any shop and they'll show up here.</p>
          <Button variant="outline" className="mt-5" onClick={close}>
            Browse menu
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-5">
            {groups.map(({ vendor, items: vendorItems }) => (
              <section key={vendor.id} aria-label={vendor.name}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base font-semibold text-ink">{vendor.name}</h3>
                  <span className="shrink-0 text-sm text-ink-3">About {vendor.defaultPrepMin} min</span>
                </div>
                <ul className="divide-y divide-line">
                  {vendorItems.map((item) => (
                    <CartLine
                      key={item.id}
                      item={item}
                      onAdd={() =>
                        add({ id: item.itemId, name: item.name, pricePaise: item.pricePaise, veg: item.veg }, item.vendorId)
                      }
                      onRemove={() => decrement(item.itemId)}
                      onNote={(note) => setNote(item.itemId, note)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <dl className="mt-5 space-y-2.5 rounded-card bg-bg p-4 text-sm">
            <div className="flex justify-between text-ink-2">
              <dt>Item total</dt>
              <dd className="tabular-nums">{formatPaise(totals.subtotalPaise)}</dd>
            </div>
            <div className="flex justify-between text-ink-3">
              <dt>{config.taxInclusive ? `Includes GST (${config.gstPct}%)` : `GST (${config.gstPct}%)`}</dt>
              <dd className="tabular-nums">{formatPaise(totals.taxPaise)}</dd>
            </div>
            {totals.platformFeePaise > 0 && (
              <div className="flex justify-between text-ink-2">
                <dt>Platform fee</dt>
                <dd className="tabular-nums">{formatPaise(totals.platformFeePaise)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-3 text-base font-semibold text-ink">
              <dt>To pay</dt>
              <dd className="tabular-nums">{formatPaise(totals.totalPaise)}</dd>
            </div>
          </dl>

          {config.flags.loyaltyEnabled && points > 0 && (
            profile ? (
              <p className="mt-4 flex items-center gap-2.5 text-sm text-ink-2">
                <Gift className="h-[18px] w-[18px] shrink-0 text-accent-ink" strokeWidth={1.75} />
                You'll earn {points} REVA points when you collect.
              </p>
            ) : (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-card p-4 ring-1 ring-inset ring-line">
                <p className="flex items-center gap-2.5 text-sm text-ink-2">
                  <Gift className="h-[18px] w-[18px] shrink-0 text-accent-ink" strokeWidth={1.75} />
                  <span>
                    Sign in to earn <span className="font-semibold text-ink">{points} REVA points</span>
                  </span>
                </p>
                <Button variant="quiet" onClick={() => show('login')}>
                  Sign in
                </Button>
              </div>
            )
          )}
        </>
      )}
    </Sheet>
  );
}

interface CartLineProps {
  item: CartItem;
  onAdd: () => void;
  onRemove: () => void;
  onNote: (note: string) => void;
}

function CartLine({ item, onAdd, onRemove, onNote }: CartLineProps) {
  const [editingNote, setEditingNote] = useState(Boolean(item.note));
  return (
    <li className="py-3.5">
      <div className="flex items-start gap-3">
        <VegDot veg={item.veg} size="sm" className="mt-[3px] shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium leading-snug text-ink">{item.name}</p>
          <p className="mt-0.5 text-sm tabular-nums text-ink-3">
            {formatPaise(item.pricePaise * item.qty)}
            {item.qty > 1 && ` · ${formatPaise(item.pricePaise)} each`}
          </p>
        </div>
        <QtyStepper
          tone="outline"
          className="w-[112px] shrink-0"
          qty={item.qty}
          itemName={item.name}
          onIncrement={onAdd}
          onDecrement={onRemove}
        />
      </div>
      {editingNote ? (
        <label className="mt-2.5 block pl-6">
          <span className="sr-only">Cooking note for {item.name}</span>
          <input
            type="text"
            autoFocus={!item.note}
            value={item.note ?? ''}
            maxLength={120}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Less spicy, no onion…"
            className="h-11 w-full rounded-field bg-surface-2 px-3.5 text-md text-ink outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-accent/50"
          />
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setEditingNote(true)}
          className="-mb-2 ml-6 inline-flex h-11 items-center gap-1.5 text-sm font-medium text-accent-ink"
        >
          <NotebookPen className="h-4 w-4" strokeWidth={1.75} />
          Add a cooking note
        </button>
      )}
    </li>
  );
}
