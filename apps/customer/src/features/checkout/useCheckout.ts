import { useState } from 'react';
import { toast } from 'sonner';
import { getIstDateKey, type CartItem, type Order, type OrderTotals } from '@foodcourt/shared';
import { ensureAnonymousUser, getCallable } from '../../lib/firebase';
import { localStore } from '../../lib/store';
import { useProfile } from '../auth/profileStore';
import { useCart } from '../cart/cartStore';
import type { TableSession } from '../session/useTableSession';
import { useUi } from '../ui/uiStore';

interface CashfreeInstance {
  checkout: (options: { paymentSessionId: string; redirectTarget: '_modal' }) => Promise<unknown>;
}
declare global {
  interface Window {
    Cashfree?: (options: { mode: 'sandbox' | 'production' }) => CashfreeInstance;
  }
}

const CASHFREE_SDK = 'https://sdk.cashfree.com/js/v3/cashfree.js';
let cashfreeLoader: Promise<Window['Cashfree']> | null = null;

// The SDK used to block first paint on every scan; now it loads only when the cart opens.
function loadCashfree(): Promise<Window['Cashfree']> {
  if (window.Cashfree) return Promise.resolve(window.Cashfree);
  if (!cashfreeLoader) {
    cashfreeLoader = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = CASHFREE_SDK;
      script.async = true;
      script.onload = () => resolve(window.Cashfree);
      script.onerror = () => {
        cashfreeLoader = null;
        resolve(undefined);
      };
      document.head.appendChild(script);
    });
  }
  return cashfreeLoader;
}

export function preloadCheckout(): void {
  void loadCashfree();
  void import('@foodcourt/firebase-client/functions');
  ensureAnonymousUser().catch(() => {});
}

interface CheckoutRequest {
  sessionId: string;
  checkoutKey: string;
  items: Array<{
    itemId: string;
    vendorId: string;
    name: string;
    pricePaise: number;
    veg: boolean;
    qty: number;
    note?: string;
  }>;
  customerPhone?: string;
}

interface CheckoutResponse {
  orderId: string;
  paymentSessionId: string;
  status: string;
  totalPaise?: number;
}

export function useCheckout(session: TableSession) {
  const [pending, setPending] = useState(false);

  const checkout = async (items: CartItem[], totals: OrderTotals) => {
    if (items.length === 0 || pending) return;
    setPending(true);

    const now = Date.now();
    const dateKey = getIstDateKey();
    const checkoutKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `ck_${now}`;

    // The real order and sub-orders are written server-side by the webhook. This placeholder
    // lets tracking open immediately; the listener replaces it with real data.
    const finalize = (orderId: string) => {
      localStore.mutate((draft) => {
        if (draft.orders[orderId]) return;
        const optimistic: Order = {
          id: orderId,
          sessionId: session.id,
          uid: `guest_${session.dailyNo}`,
          tableId: session.tableId,
          tableLabel: session.tableLabel,
          dateKey,
          items: items.map((i) => ({
            itemId: i.itemId,
            vendorId: i.vendorId,
            name: i.name,
            pricePaise: i.pricePaise,
            veg: i.veg,
            qty: i.qty,
            note: i.note,
          })),
          totals,
          payment: { status: 'PENDING' },
          status: 'PENDING_PAYMENT',
          checkoutKey,
          createdAt: now,
        };
        draft.orders[orderId] = optimistic;
      });
      const cart = useCart.getState();
      cart.clear();
      cart.setActiveOrder(orderId);
      const ui = useUi.getState();
      ui.hide('cart');
      ui.show('tracking');
      setPending(false);
    };

    try {
      const createCheckout = await getCallable<CheckoutRequest, CheckoutResponse>('createCheckout');
      const { data } = await createCheckout({
        sessionId: session.id,
        checkoutKey,
        items: items.map((i) => ({
          itemId: i.itemId,
          vendorId: i.vendorId,
          name: i.name,
          pricePaise: i.pricePaise,
          veg: i.veg,
          qty: i.qty,
          note: i.note || undefined,
        })),
        customerPhone: useProfile.getState().profile?.phone || '9876543210',
      });

      const Cashfree = await loadCashfree();
      if (Cashfree && data.paymentSessionId) {
        Cashfree({ mode: 'sandbox' })
          .checkout({ paymentSessionId: data.paymentSessionId, redirectTarget: '_modal' })
          .then(() => finalize(data.orderId))
          .catch((err: unknown) => {
            console.warn('Cashfree modal error:', err);
            // Existing behaviour, kept until the payments PR (with webhook tests) revisits it.
            finalize(data.orderId);
          });
      } else {
        finalize(data.orderId);
      }
    } catch (err: unknown) {
      console.error('createCheckout callable failed:', err);
      setPending(false);
      const offline = !navigator.onLine || (err as { code?: string })?.code === 'functions/unavailable';
      toast.error("Couldn't start payment", {
        description: offline
          ? 'Check your connection. Your cart is saved.'
          : 'Nothing was charged. Your cart is saved.',
        action: { label: 'Try again', onClick: () => void checkout(items, totals) },
      });
    }
  };

  return { checkout, pending };
}
