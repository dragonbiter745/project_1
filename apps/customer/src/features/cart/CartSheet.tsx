import { useEffect, useMemo, useState } from 'react';
import { notify } from '../../lib/toast';
import { ChevronRight, Gift, NotebookPen, ShoppingBag, TicketPercent, X } from 'lucide-react';
import { calculatePointsEarned, computeOrderTotals, formatPaise, withDiscount, type CartItem } from '@foodcourt/shared';
import { couponLines, previewSaving, useCoupon } from '../coupons/couponStore';
import { Button, QtyStepper, Sheet, VegDot } from '@foodcourt/ui';
import { cx } from '../../lib/format';
import { jsonEqual, useLocal } from '../../lib/store';
import { useOnline } from '../../lib/useOnline';
import { selectMember, useAuth } from '../../lib/authStore';
import { SignInNudge } from '../auth/SignInNudge';
import { preloadCheckout, useCheckout } from '../checkout/useCheckout';
import type { TableSession } from '../session/useTableSession';
import { useUi } from '../ui/uiStore';
import { useCart } from './cartStore';

type Blocked = 'sold-out' | 'paused';

export function CartSheet({ session }: { session: TableSession }) {
  const open = useUi((s) => s.open.cart);
  const hide = useUi((s) => s.hide);
  const show = useUi((s) => s.show);
  const items = useCart((s) => s.items);
  const add = useCart((s) => s.add);
  const decrement = useCart((s) => s.decrement);
  const setNote = useCart((s) => s.setNote);
  const restore = useCart((s) => s.restore);
  const clear = useCart((s) => s.clear);
  const vendors = useLocal((s) => s.vendors, jsonEqual);
  const availability = useLocal((s) => s.availability, jsonEqual);
  const config = useLocal((s) => s.config, jsonEqual);
  const member = useAuth(selectMember);
  const online = useOnline();
  const { checkout, pending } = useCheckout(session);

  const list = useMemo(() => Object.values(items), [items]);
  const totals = useMemo(() => computeOrderTotals({ items: list, config }), [list, config]);
  // Coupons are paid by the court and only work online; the server re-checks this one at checkout.
  const coupon = useCoupon((s) => s.preview);
  const clearCoupon = useCoupon((s) => s.clear);
  const menus = useLocal((s) => s.menus);
  const saving = useMemo(
    () => (coupon && config.flags.paymentsEnabled ? previewSaving(coupon, couponLines(list, menus), totals.totalPaise) : null),
    [coupon, config.flags.paymentsEnabled, list, menus, totals.totalPaise]
  );
  const discountPaise = saving?.ok ? saving.discountPaise : 0;
  const payable = withDiscount(totals, discountPaise);
  const points = calculatePointsEarned(totals.subtotalPaise, config.pointsPerRupee);
  const groups = vendors
    .map((vendor) => ({ vendor, items: list.filter((i) => i.vendorId === vendor.id) }))
    .filter((g) => g.items.length > 0);

  // The server re-checks all of this; surfacing it here saves a failed payment attempt.
  const blockedReason = (item: CartItem): Blocked | null => {
    if (vendors.find((v) => v.id === item.vendorId)?.acceptingOrders === false) return 'paused';
    if (availability[item.vendorId]?.unavailable[item.itemId]) return 'sold-out';
    return null;
  };
  const hasBlocked = list.some((i) => blockedReason(i) !== null);
  const payBlocker = config.flags.maintenance
    ? 'Ordering is paused for a few minutes. Please try again shortly.'
    : !online
    ? "You're offline. Reconnect to pay."
    : hasBlocked
      ? 'Remove unavailable items to continue.'
      : null;

  useEffect(() => {
    if (open) preloadCheckout();
  }, [open]);

  const close = () => hide('cart');

  const removeOne = (item: CartItem) => {
    decrement(item.itemId);
    if (item.qty > 1) return;
    notify(`Removed ${item.name}`, { action: { label: 'Undo', onClick: () => restore([item]) } });
  };

  const clearAll = () => {
    const snapshot = list;
    clear();
    notify('Cart cleared', { action: { label: 'Undo', onClick: () => restore(snapshot) } });
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Your order"
      description={`Table ${session.tableLabel} · One payment for every shop`}
      footer={
        list.length > 0 ? (
          <div>
            {payBlocker && (
              <p role="status" className="mb-2.5 text-center text-sm font-medium text-danger">
                {payBlocker}
              </p>
            )}
            <Button
              size="lg"
              block
              loading={pending}
              disabled={payBlocker !== null}
              onClick={() => checkout(list, payable, discountPaise > 0 ? coupon?.coupon.code : undefined)}
            >
              Pay {formatPaise(payable.totalPaise)}
              {discountPaise > 0 && <span className="ml-1 text-sm font-medium line-through opacity-60">{formatPaise(totals.totalPaise)}</span>}
            </Button>
          </div>
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
                      blocked={blockedReason(item)}
                      onAdd={() =>
                        add({ id: item.itemId, name: item.name, pricePaise: item.pricePaise, veg: item.veg }, item.vendorId)
                      }
                      onRemove={() => removeOne(item)}
                      onNote={(note) => setNote(item.itemId, note)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <Button variant="ghost" size="sm" className="-ml-3 mt-1" onClick={clearAll}>
            Clear cart
          </Button>

          {config.flags.paymentsEnabled && (
            <CouponRow
              code={coupon?.coupon.code ?? null}
              discountPaise={discountPaise}
              reason={saving && !saving.ok ? saving.reason : null}
              onOpen={() => show('coupons')}
              onRemove={clearCoupon}
            />
          )}

          <dl className="mt-4 space-y-2.5 rounded-card bg-bg p-4 text-sm">
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
            {discountPaise > 0 && (
              <div className="flex justify-between font-medium text-ready">
                <dt>Coupon {coupon?.coupon.code}</dt>
                <dd className="tabular-nums">− {formatPaise(discountPaise)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-3 text-base font-semibold text-ink">
              <dt>To pay</dt>
              <dd className="tabular-nums">{formatPaise(payable.totalPaise)}</dd>
            </div>
          </dl>

          {member && config.flags.loyaltyEnabled && points > 0 && (
            <p className="mt-4 flex items-center gap-2.5 text-sm text-ink-2">
              <Gift className="h-[18px] w-[18px] shrink-0 text-accent-ink" strokeWidth={1.75} />
              You'll earn {points} REVA points when you collect.
            </p>
          )}
          <SignInNudge place="cart" className="mt-4" />
        </>
      )}
    </Sheet>
  );
}

function CouponRow({ code, discountPaise, reason, onOpen, onRemove }: { code: string | null; discountPaise: number; reason: string | null; onOpen: () => void; onRemove: () => void }) {
  if (!code) {
    return (
      <button type="button" onClick={onOpen} className="hover-surface mt-4 flex w-full items-center gap-3 rounded-card px-4 py-3.5 text-left ring-1 ring-inset ring-line transition-colors">
        <TicketPercent className="h-5 w-5 shrink-0 text-accent-ink" strokeWidth={1.75} />
        <span className="flex-1 text-base font-medium text-ink">Apply a coupon</span>
        <ChevronRight className="h-4 w-4 text-ink-3" />
      </button>
    );
  }
  return (
    <div
      className={cx(
        'mt-4 flex items-center gap-3 rounded-card px-4 py-3 ring-1 ring-inset',
        discountPaise > 0 ? 'bg-ready-tint ring-ready/25' : 'bg-surface ring-line'
      )}
    >
      <TicketPercent className={cx('h-5 w-5 shrink-0', discountPaise > 0 ? 'text-ready' : 'text-ink-3')} strokeWidth={1.75} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block font-mono text-sm font-semibold tracking-wide text-ink">{code}</span>
        <span className={cx('block text-sm', discountPaise > 0 ? 'font-medium text-ready' : 'text-danger')} aria-live="polite">
          {discountPaise > 0 ? `You save ${formatPaise(discountPaise)}` : reason}
        </span>
      </button>
      <button type="button" onClick={onRemove} aria-label={`Remove coupon ${code}`} className="pressable grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3 hover:text-ink">
        <X className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}

interface CartLineProps {
  item: CartItem;
  blocked: Blocked | null;
  onAdd: () => void;
  onRemove: () => void;
  onNote: (note: string) => void;
}

function CartLine({ item, blocked, onAdd, onRemove, onNote }: CartLineProps) {
  const [editingNote, setEditingNote] = useState(Boolean(item.note));
  return (
    <li className="py-3.5">
      <div className="flex items-start gap-3">
        <VegDot veg={item.veg} size="sm" className="mt-[3px] shrink-0" />
        <div className="min-w-0 flex-1">
          <p className={cx('text-base font-medium leading-snug [overflow-wrap:anywhere]', blocked ? 'text-ink-3' : 'text-ink')}>{item.name}</p>
          {blocked ? (
            <p className="mt-0.5 text-sm font-medium text-danger">
              {blocked === 'paused' ? 'Shop paused. Remove to continue.' : 'Sold out. Remove to continue.'}
            </p>
          ) : (
            <p className="mt-0.5 text-sm tabular-nums text-ink-3">
              {formatPaise(item.pricePaise * item.qty)}
              {item.qty > 1 && ` · ${formatPaise(item.pricePaise)} each`}
            </p>
          )}
        </div>
        {blocked ? (
          <Button variant="outline" className="shrink-0" onClick={onRemove} aria-label={`Remove ${item.name}`}>
            Remove
          </Button>
        ) : (
          <QtyStepper
            tone="outline"
            className="w-[112px] shrink-0"
            qty={item.qty}
            itemName={item.name}
            onIncrement={onAdd}
            onDecrement={onRemove}
          />
        )}
      </div>
      {!blocked &&
        (editingNote ? (
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
        ))}
    </li>
  );
}
