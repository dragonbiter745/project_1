import { createContext, useContext } from 'react';
import type { InboxMessage, Order, UserProfile } from '@foodcourt/shared';
import { useAuth } from '../../lib/authStore';
import { jsonEqual, liveStore, useLocal } from '../../lib/store';
import { notify, notifyError } from '../../lib/toast';
import { useCart } from '../cart/cartStore';
import { useOrderHistory } from '../history/orderHistory';
import { planReorder } from '../history/reorder';
import type { TableSession } from '../session/useTableSession';
import { useUi } from '../ui/uiStore';

export type Route =
  | { name: 'home' }
  | { name: 'inbox' }
  | { name: 'orders' }
  | { name: 'order'; id: string }
  | { name: 'receipt'; id: string }
  | { name: 'favourites' }
  | { name: 'coupons' }
  | { name: 'payments' }
  | { name: 'points' }
  | { name: 'notifications' }
  | { name: 'profile' }
  | { name: 'help' }
  | { name: 'privacy' };

export interface Hub {
  /** Null on the website before a pickup session exists. */
  session: TableSession | null;
  push: (route: Route) => void;
  back: () => void;
  closeHub: () => void;
}

export const HubContext = createContext<Hub | null>(null);
export const useHub = (): Hub => useContext(HubContext)!;

const HIDDEN = new Set(['FAILED', 'EXPIRED', 'CREATED']);

/** Orders by this diner (their account, or this phone as a guest), newest first. */
export function useMyOrders(): Order[] {
  const uid = useAuth((s) => s.user?.uid);
  const historyIds = useOrderHistory((s) => s.orderIds);
  return useLocal((s) => {
    const ids = new Set(historyIds);
    return Object.values(s.orders)
      .filter((o) => (o.uid === uid || ids.has(o.id)) && !HIDDEN.has(o.status))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, jsonEqual);
}

/** The diner's messages from the court, newest first. */
export function useInbox(): InboxMessage[] {
  const uid = useAuth((s) => s.user?.uid);
  return useLocal((s) => Object.values(s.inbox).filter((m) => m.uid === uid).sort((a, b) => b.createdAt - a.createdAt), jsonEqual);
}

/** The signed-in diner's profile document, once it has loaded. */
export function useMyProfile(): UserProfile | null {
  const uid = useAuth((s) => s.user?.uid);
  return useLocal((s) => (uid ? s.users[uid] ?? null : null));
}

export function useVendorNames(): Record<string, string> {
  return useLocal((s) => Object.fromEntries(s.vendors.map((v) => [v.id, v.name])), jsonEqual);
}

export const shopsOf = (order: Order, names: Record<string, string>) =>
  [...new Set(order.items.map((i) => i.vendorId))].map((id) => names[id] ?? 'A shop').join(' · ');

/** Puts an old order back in the cart at today's prices, leaving out anything unavailable. */
export function reorder(order: Order, onDone?: () => void): void {
  const { lines, skipped } = planReorder(order, liveStore.getState());
  if (lines.length === 0) {
    notifyError("Couldn't reorder", { description: 'None of these dishes are available right now.' });
    return;
  }
  useCart.getState().addMany(lines);
  onDone?.();
  useUi.getState().show('cart');
  if (skipped.length > 0) notify('Some dishes were left out', { description: `Not available now: ${skipped.join(', ')}` });
}

/** Opens live tracking for an order still in the kitchen. */
export function track(orderId: string, onDone?: () => void): void {
  useCart.getState().setActiveOrder(orderId);
  onDone?.();
  useUi.getState().show('tracking');
}
