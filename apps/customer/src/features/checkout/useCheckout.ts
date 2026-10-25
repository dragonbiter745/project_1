import { useState } from 'react';
import { notify, notifyError } from '../../lib/toast';
import { getIstDateKey, type CartItem, type Order, type OrderTotals } from '@foodcourt/shared';
import { useAuth } from '../../lib/authStore';
import { ensureAnonymousUser, getCallable } from '../../lib/firebase';
import { liveStore } from '../../lib/store';
import { useProfile } from '../auth/profileStore';
import { useCart } from '../cart/cartStore';
import { useCoupon } from '../coupons/couponStore';
import { useOrderHistory } from '../history/orderHistory';
import { isWebMode } from '../session/orderMode';
import { ensurePickupSession } from '../session/usePickupSession';
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

export function preloadCheckout(paysOnline: boolean): void {
  if (paysOnline) void loadCashfree();
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
  couponCode?: string;
}

interface CheckoutResponse {
  orderId: string;
  status: string;
  paymentSessionId: string | null;
  cashfreeMode: 'production' | 'sandbox' | null;
  totalPaise: number;
}

interface CashfreeResult {
  error?: { message?: string };
  paymentDetails?: unknown;
  redirect?: boolean;
}

/** On the website `tableSession` is null; checkout opens the signed-in diner's pickup session itself. */
export function useCheckout(tableSession: TableSession | null) {
  const [pending, setPending] = useState(false);

  const checkout = async (items: CartItem[], totals: OrderTotals, couponCode?: string) => {
    if (items.length === 0 || pending) return;
    const paymentsOn = liveStore.getState().config.flags.paymentsEnabled;
    // Website orders need an account and are paid online (the server checks both again).
    if (isWebMode && !useAuth.getState().user?.member) {
      useUi.getState().showLogin('Sign in to place your order. You collect it at the counter with your token.', { required: true });
      return;
    }
    if (isWebMode && !paymentsOn) {
      notifyError('Online orders are paused', { description: 'Scan the QR on a table at the court to order there.' });
      return;
    }
    const phone = useProfile.getState().profile?.phone;
    // Table guests pay without a number (the server stands one in for Cashfree); only website accounts are asked.
    if (isWebMode && paymentsOn && !phone) {
      useUi.getState().showDetails('checkout');
      notify('Add your mobile number to pay', { description: 'Your payment receipt is sent to it.' });
      return;
    }
    setPending(true);
    let session: TableSession;
    try {
      const opened = isWebMode ? await ensurePickupSession(true) : tableSession;
      if (!opened) throw new Error('No session');
      session = opened;
    } catch (err) {
      console.error('Could not open the order session', err);
      setPending(false);
      notifyError("Couldn't start your order", { description: navigator.onLine ? 'Please try again.' : 'Check your connection. Your cart is saved.' });
      return;
    }

    // A fresh key per attempt: the same key always maps to the same server order.
    const checkoutKey = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `ck_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const finalize = (orderId: string, status: string) => {
      // Shown until the live listener delivers the real order a moment later.
      liveStore.patch((draft) => {
        if (draft.orders[orderId]) return;
        const placeholder: Order = {
          id: orderId,
          sessionId: session.id,
          uid: '',
          tableId: session.tableId,
          tableLabel: session.tableLabel,
          dateKey: getIstDateKey(),
          items: items.map((i) => ({ itemId: i.itemId, vendorId: i.vendorId, name: i.name, pricePaise: i.pricePaise, veg: i.veg, qty: i.qty, note: i.note })),
          totals,
          payment: { status: 'PENDING' },
          status: status === 'PAID' ? 'PAID' : 'PENDING_PAYMENT',
          checkoutKey,
          createdAt: Date.now(),
        };
        draft.orders[orderId] = placeholder;
      });
      useOrderHistory.getState().record(orderId);
      if (couponCode) useCoupon.getState().clear();
      const cart = useCart.getState();
      cart.clear();
      cart.setActiveOrder(orderId);
      const ui = useUi.getState();
      ui.hide('cart');
      ui.show('tracking');
    };

    try {
      const createCheckout = await getCallable<CheckoutRequest, CheckoutResponse>('createCheckout');
      const { data } = await createCheckout({
        sessionId: session.id,
        checkoutKey,
        items: items.map((i) => ({ itemId: i.itemId, vendorId: i.vendorId, name: i.name, pricePaise: i.pricePaise, veg: i.veg, qty: i.qty, note: i.note || undefined })),
        ...(phone ? { customerPhone: phone } : {}),
        ...(couponCode ? { couponCode } : {}),
      });

      // Pay at the counter: already confirmed and sent to the kitchens.
      if (!data.paymentSessionId || !data.cashfreeMode) {
        finalize(data.orderId, data.status);
        return;
      }

      const Cashfree = await loadCashfree();
      if (!Cashfree) {
        notifyError("Couldn't open the payment window", { description: 'Check your connection. Nothing was charged.' });
        return;
      }
      const result = (await Cashfree({ mode: data.cashfreeMode }).checkout({ paymentSessionId: data.paymentSessionId, redirectTarget: '_modal' })) as CashfreeResult;
      if (result?.error) {
        // Closed or failed: nothing is sent to the kitchens; the cart stays as it was.
        notifyError('Payment not completed', { description: result.error.message || 'Nothing was charged. You can try again.' });
        return;
      }
      // Paid in the window (or about to redirect): tracking shows "Confirming payment" until Cashfree confirms.
      finalize(data.orderId, data.status);
    } catch (err: unknown) {
      console.error('Checkout failed:', err);
      const e = err as { code?: string; message?: string };
      const offline = !navigator.onLine || e?.code === 'functions/unavailable';
      const known = e?.code === 'functions/failed-precondition' || e?.code === 'functions/invalid-argument' || e?.code === 'functions/not-found' || e?.code === 'functions/resource-exhausted';
      // The coupon no longer applies (used up, expired, already used): offer to pay without it.
      if (couponCode && /coupon/i.test(e?.message ?? '')) {
        notifyError("The coupon didn't go through", {
          description: e.message,
          action: {
            label: 'Pay without it',
            onClick: () => {
              useCoupon.getState().clear();
              void checkout(items, { ...totals, totalPaise: totals.totalPaise + (totals.discountPaise ?? 0), discountPaise: undefined });
            },
          },
        });
        return;
      }
      notifyError("Couldn't place the order", {
        description: known ? e.message : offline ? 'Check your connection. Your cart is saved.' : 'Nothing was charged. Your cart is saved.',
        action: known ? undefined : { label: 'Try again', onClick: () => void checkout(items, totals, couponCode) },
      });
    } finally {
      setPending(false);
    }
  };

  return { checkout, pending };
}
