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

interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
interface RazorpayFailure {
  error?: { description?: string; reason?: string };
}
interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', handler: (response: RazorpayFailure) => void) => void;
}
interface RazorpayOptions {
  key: string;
  order_id: string;
  name: string;
  description?: string;
  prefill?: { contact?: string };
  theme?: { color: string };
  handler: (response: RazorpaySuccess) => void;
  modal: { ondismiss: () => void };
}
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const RAZORPAY_SDK = 'https://checkout.razorpay.com/v1/checkout.js';
let razorpayLoader: Promise<Window['Razorpay']> | null = null;

// The script loads only when the cart opens, never on first paint, so it costs the bundle nothing.
function loadRazorpay(): Promise<Window['Razorpay']> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!razorpayLoader) {
    razorpayLoader = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = RAZORPAY_SDK;
      script.async = true;
      script.onload = () => resolve(window.Razorpay);
      script.onerror = () => {
        razorpayLoader = null;
        resolve(undefined);
      };
      document.head.appendChild(script);
    });
  }
  return razorpayLoader;
}

type PaymentOutcome = { paid: true; response: RazorpaySuccess } | { paid: false; message?: string };

/** Opens the Razorpay window and settles with what happened: paid, dismissed, or failed. */
function openRazorpay(Razorpay: NonNullable<Window['Razorpay']>, options: Omit<RazorpayOptions, 'handler' | 'modal'>): Promise<PaymentOutcome> {
  return new Promise((resolve) => {
    const rzp = new Razorpay({
      ...options,
      handler: (response) => resolve({ paid: true, response }),
      modal: { ondismiss: () => resolve({ paid: false }) },
    });
    rzp.on('payment.failed', (r) => resolve({ paid: false, message: r.error?.description || r.error?.reason }));
    rzp.open();
  });
}

export function preloadCheckout(paysOnline: boolean): void {
  if (paysOnline) void loadRazorpay();
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
  razorpayOrderId: string | null;
  razorpayKeyId: string | null;
  totalPaise: number;
}

/** On the website `tableSession` is null; checkout opens the signed-in diner's pickup session itself. */
export function useCheckout(tableSession: TableSession | null) {
  const [pending, setPending] = useState(false);

  const checkout = async (items: CartItem[], totals: OrderTotals, couponCode?: string) => {
    if (items.length === 0 || pending) return;
    const paymentsOn = liveStore.getState().config.flags.paymentsEnabled;
    // Website orders are paid online (the server checks again). An account is optional: guests order too.
    if (isWebMode && !paymentsOn) {
      notifyError('Online orders are paused', { description: 'Scan the QR on a table at the court to order there.' });
      return;
    }
    const phone = useProfile.getState().profile?.phone;
    // Guests pay without a number (Razorpay's window asks for one itself); only signed-in website diners are asked.
    if (isWebMode && paymentsOn && useAuth.getState().user?.member && !phone) {
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
      if (!data.razorpayOrderId || !data.razorpayKeyId) {
        finalize(data.orderId, data.status);
        return;
      }

      const Razorpay = await loadRazorpay();
      if (!Razorpay) {
        notifyError("Couldn't open the payment window", { description: 'Check your connection. Nothing was charged.' });
        return;
      }
      const outcome = await openRazorpay(Razorpay, {
        key: data.razorpayKeyId,
        order_id: data.razorpayOrderId,
        name: 'Qrave',
        description: 'Food court order',
        ...(phone ? { prefill: { contact: phone } } : {}),
        theme: { color: '#111111' },
      });
      if (!outcome.paid) {
        // Closed or failed: nothing is sent to the kitchens; the cart stays as it was.
        notifyError('Payment not completed', { description: outcome.message || 'Nothing was charged. You can try again.' });
        return;
      }
      // The window says paid. The server checks the signature and reads the payment back before settling.
      // If that call can't be made (network), the webhook still settles it, so tracking shows "Confirming payment".
      try {
        const verify = await getCallable<RazorpaySuccess, { verified: boolean; settled: boolean }>('verifyPayment');
        await verify(outcome.response);
      } catch (err: unknown) {
        if ((err as { code?: string })?.code === 'functions/invalid-argument') {
          notifyError('Payment could not be verified', { description: 'If money left your account, it is refunded automatically. Please try again.' });
          return;
        }
        console.warn('verifyPayment unavailable; waiting for the webhook', err);
      }
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
