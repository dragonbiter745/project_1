import { useEffect, useState } from 'react';
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
  /** Off: after a failed attempt the window closes, so the app always learns the final outcome. */
  retry?: { enabled: boolean };
  /** Seconds until the window closes by itself; kept inside the server's payment window. */
  timeout?: number;
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

type PaymentOutcome = { paid: true; response: RazorpaySuccess } | { paid: false; failed: boolean; message?: string };

/** Opens the Razorpay window and settles with what happened: paid, closed, or failed. */
function openRazorpay(Razorpay: NonNullable<Window['Razorpay']>, options: Omit<RazorpayOptions, 'handler' | 'modal'>): Promise<PaymentOutcome> {
  return new Promise((resolve) => {
    const rzp = new Razorpay({
      ...options,
      handler: (response) => resolve({ paid: true, response }),
      modal: { ondismiss: () => resolve({ paid: false, failed: false }) },
    });
    rzp.on('payment.failed', (r) => resolve({ paid: false, failed: true, message: r.error?.description || r.error?.reason }));
    rzp.open();
  });
}

export function preloadCheckout(paysOnline: boolean): void {
  if (paysOnline) void loadRazorpay();
  void import('@foodcourt/firebase-client/functions');
  ensureAnonymousUser().catch(() => {});
}

interface CheckoutLine {
  itemId: string;
  vendorId: string;
  name: string;
  pricePaise: number;
  veg: boolean;
  qty: number;
  note?: string;
}
interface CheckoutRequest {
  sessionId: string;
  checkoutKey: string;
  items: CheckoutLine[];
  customerPhone?: string;
  couponCode?: string;
  allowRepeat?: boolean;
}
interface CheckoutResponse {
  orderId: string;
  status: string;
  razorpayOrderId: string | null;
  razorpayKeyId: string | null;
  totalPaise: number;
  expiresAt?: number | null;
  /** This cart was paid moments ago; the server returned that order instead of charging again. */
  alreadyPaid?: boolean;
}

// ─── The open payment attempt, kept across reloads ──────────────────────────
//
// Android often reloads the page on the way back from a UPI app, so the success callback never runs. The
// attempt is saved before the payment window opens; on the next load (or when the tab comes back) the app
// asks the server what became of it, and shows the paid order instead of letting the diner pay again.

const ATTEMPT_KEY = 'qrave.checkoutAttempt';

interface Attempt {
  cartHash: string;
  request: CheckoutRequest;
  orderId?: string;
  expiresAt?: number;
  session: { id: string; tableId: string; tableLabel: string };
  totals: OrderTotals;
  savedAt: number;
}

function readAttempt(): Attempt | null {
  try {
    const raw = window.localStorage.getItem(ATTEMPT_KEY);
    const a = raw ? (JSON.parse(raw) as Attempt) : null;
    // Nothing can still be paid two hours later; the server refunds anything that lands after expiry.
    if (!a || Date.now() - a.savedAt > 2 * 3600_000) return null;
    return a;
  } catch {
    return null;
  }
}
function saveAttempt(a: Attempt): void {
  try {
    window.localStorage.setItem(ATTEMPT_KEY, JSON.stringify(a));
  } catch {
    /* private mode: recovery is best effort, the server still prevents a second charge */
  }
}
function clearAttempt(): void {
  try {
    window.localStorage.removeItem(ATTEMPT_KEY);
  } catch {
    /* ignore */
  }
}

/** Same session, dishes, quantities, notes and coupon → same hash, whatever order they were added in. */
function hashCart(sessionId: string, items: CheckoutLine[], couponCode?: string): string {
  const lines = items.map((i) => `${i.vendorId}|${i.itemId}|${i.qty}|${i.note ?? ''}`).sort();
  return JSON.stringify([sessionId, lines, (couponCode ?? '').toUpperCase()]);
}

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `ck_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Shows the order as placed: clears the cart and opens tracking. The live listener replaces the placeholder a moment later. */
function finalize(a: Attempt, orderId: string, status: string): void {
  clearAttempt();
  liveStore.patch((draft) => {
    if (draft.orders[orderId]) return;
    const placeholder: Order = {
      id: orderId,
      sessionId: a.session.id,
      uid: '',
      tableId: a.session.tableId,
      tableLabel: a.session.tableLabel,
      dateKey: getIstDateKey(),
      items: a.request.items.map((i) => ({ itemId: i.itemId, vendorId: i.vendorId, name: i.name, pricePaise: i.pricePaise, veg: i.veg, qty: i.qty, note: i.note })),
      totals: a.totals,
      payment: { status: 'PENDING' },
      status: status === 'PAID' ? 'PAID' : 'PENDING_PAYMENT',
      checkoutKey: a.request.checkoutKey,
      createdAt: Date.now(),
    };
    draft.orders[orderId] = placeholder;
  });
  useOrderHistory.getState().record(orderId);
  if (a.request.couponCode) useCoupon.getState().clear();
  const cart = useCart.getState();
  cart.clear();
  cart.setActiveOrder(orderId);
  const ui = useUi.getState();
  ui.hide('cart');
  ui.show('tracking');
}

const AFTER_FAILURE = 'If your bank shows a debit, this order updates by itself, or the money is refunded automatically.';

let recovering = false;

/**
 * Asks the server what became of a saved attempt. The same key always answers with the same order and
 * creates nothing (and spends no allowance), so this is safe to call as often as needed.
 */
async function recoverAttempt(): Promise<'paid' | 'open' | 'closed' | 'none'> {
  const a = readAttempt();
  if (!a?.orderId || recovering) return 'none';
  recovering = true;
  try {
    const createCheckout = await getCallable<CheckoutRequest, CheckoutResponse>('createCheckout');
    const { data } = await createCheckout(a.request);
    if (data.status === 'PAID' || data.status === 'COMPLETED' || data.status === 'PARTIALLY_REFUNDED' || data.status === 'REFUNDED') {
      finalize(a, data.orderId, 'PAID');
      notify('Your payment went through', { description: 'Your order is with the kitchen.' });
      return 'paid';
    }
    return 'open';
  } catch (err) {
    // The attempt closed without payment (expired or failed): forget it; the cart is still there.
    if ((err as { code?: string })?.code === 'functions/aborted') {
      clearAttempt();
      return 'closed';
    }
    return 'none';
  } finally {
    recovering = false;
  }
}

/**
 * On load and whenever the tab comes back: a payment finished in a UPI app (or on another screen) shows up
 * as the paid order, and the diner is never invited to pay for the same cart again.
 */
export function useCheckoutRecovery(): void {
  useEffect(() => {
    let timers: number[] = [];
    const check = async () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
      if ((await recoverAttempt()) !== 'open') return;
      // Still unpaid: the webhook usually lands within seconds of a UPI approval, so look again a few times.
      timers = [5_000, 15_000, 30_000].map((ms) => window.setTimeout(() => void recoverAttempt(), ms));
    };
    void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);
}

/** On the website `tableSession` is null; checkout opens the signed-in diner's pickup session itself. */
export function useCheckout(tableSession: TableSession | null) {
  const [pending, setPending] = useState(false);

  const checkout = async (items: CartItem[], totals: OrderTotals, couponCode?: string, opts: { allowRepeat?: boolean } = {}): Promise<void> => {
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

    const lines: CheckoutLine[] = items.map((i) => ({ itemId: i.itemId, vendorId: i.vendorId, name: i.name, pricePaise: i.pricePaise, veg: i.veg, qty: i.qty, note: i.note || undefined }));
    const cartHash = hashCart(session.id, lines, couponCode);
    // The same key for the same cart until it is paid or its attempt closes: pressing Pay again after a failed
    // UPI attempt reopens the same order (Razorpay accepts one payment per order), never a second one.
    const saved = readAttempt();
    const reuse = saved && saved.cartHash === cartHash && !opts.allowRepeat ? saved : null;
    const attempt: Attempt = {
      cartHash,
      request: {
        sessionId: session.id,
        checkoutKey: reuse?.request.checkoutKey ?? newKey(),
        items: lines,
        ...(phone ? { customerPhone: phone } : {}),
        ...(couponCode ? { couponCode } : {}),
        ...(opts.allowRepeat ? { allowRepeat: true } : {}),
      },
      ...(reuse?.orderId ? { orderId: reuse.orderId, expiresAt: reuse.expiresAt } : {}),
      session: { id: session.id, tableId: session.tableId, tableLabel: session.tableLabel },
      totals,
      savedAt: Date.now(),
    };

    const call = async (a: Attempt) => {
      const createCheckout = await getCallable<CheckoutRequest, CheckoutResponse>('createCheckout');
      return (await createCheckout(a.request)).data;
    };

    try {
      let data: CheckoutResponse;
      try {
        data = await call(attempt);
      } catch (err) {
        // The saved attempt closed without payment: start a fresh one, once.
        if ((err as { code?: string })?.code !== 'functions/aborted' || !reuse) throw err;
        clearAttempt();
        attempt.request.checkoutKey = newKey();
        delete attempt.orderId;
        data = await call(attempt);
      }

      if (data.alreadyPaid) {
        finalize(attempt, data.orderId, 'PAID');
        notify('You already paid for this order', {
          description: 'It is with the kitchen now. Want the same again?',
          action: {
            label: 'Order again',
            onClick: () => {
              useCart.getState().restore(items);
              void checkout(items, totals, couponCode, { allowRepeat: true });
            },
          },
        });
        return;
      }

      // Pay at the counter: already confirmed and sent to the kitchens.
      if (!data.razorpayOrderId || !data.razorpayKeyId) {
        finalize(attempt, data.orderId, data.status);
        return;
      }
      if (data.status === 'PAID') {
        finalize(attempt, data.orderId, 'PAID');
        return;
      }

      attempt.orderId = data.orderId;
      attempt.expiresAt = data.expiresAt ?? undefined;
      saveAttempt(attempt);

      const Razorpay = await loadRazorpay();
      if (!Razorpay) {
        notifyError("Couldn't open the payment window", { description: 'Check your connection and tap Pay again. You have not paid yet.' });
        return;
      }
      // Close the window a minute before the server stops accepting this order, so a payment cannot start too late.
      const secondsLeft = data.expiresAt ? Math.floor((data.expiresAt - Date.now()) / 1000) - 60 : 0;
      if (data.expiresAt && secondsLeft < 60) {
        clearAttempt();
        notifyError('That payment attempt has almost closed', { description: 'Tap Pay to start a new one.' });
        return;
      }
      const outcome = await openRazorpay(Razorpay, {
        key: data.razorpayKeyId,
        order_id: data.razorpayOrderId,
        name: 'Qrave',
        description: 'Food court order',
        ...(phone ? { prefill: { contact: phone } } : {}),
        theme: { color: '#111111' },
        retry: { enabled: false },
        ...(secondsLeft > 0 ? { timeout: secondsLeft } : {}),
      });

      if (!outcome.paid) {
        // A UPI approval can still complete after the window closes. The attempt stays saved: if it does
        // complete, the order appears by itself; if not, the next Pay press reopens this same order.
        if (outcome.failed) notifyError("Payment didn't go through", { description: `${outcome.message ? `${outcome.message}. ` : ''}Tap Pay to try again. ${AFTER_FAILURE}` });
        else notify('Payment not finished', { description: `Your cart is saved. Tap Pay when you are ready. ${AFTER_FAILURE}` });
        void recoverAttempt();
        return;
      }

      // The window says paid. The server checks the signature and reads the payment back before settling.
      // If that call can't be made (network), the webhook still settles it, so tracking shows "Confirming payment".
      try {
        const verify = await getCallable<RazorpaySuccess, { verified: boolean; settled: boolean }>('verifyPayment');
        await verify(outcome.response);
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        if (e?.code === 'functions/failed-precondition') {
          // The payment arrived after the order closed, or for the wrong amount: it is being refunded in full.
          clearAttempt();
          notifyError('This order could not be placed', { description: e.message });
          return;
        }
        if (e?.code === 'functions/invalid-argument') {
          notifyError('Payment could not be verified', { description: `${AFTER_FAILURE} Please check your order history before paying again.` });
          return;
        }
        console.warn('verifyPayment unavailable; waiting for the webhook', err);
      }
      finalize(attempt, data.orderId, data.status);
    } catch (err: unknown) {
      console.error('Checkout failed:', err);
      const e = err as { code?: string; message?: string };
      const offline = !navigator.onLine;
      const known = ['functions/failed-precondition', 'functions/invalid-argument', 'functions/not-found', 'functions/resource-exhausted', 'functions/aborted', 'functions/unavailable'].includes(e?.code ?? '');
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
      // No payment window opened on any of these paths, so the diner has not paid for this attempt.
      notifyError("Couldn't place the order", {
        description: offline ? 'Check your connection. Your cart is saved.' : known && e.message ? e.message : 'Your cart is saved. You have not paid yet.',
        action: known && e?.code !== 'functions/unavailable' ? undefined : { label: 'Try again', onClick: () => void checkout(items, totals, couponCode) },
      });
    } finally {
      setPending(false);
    }
  };

  return { checkout, pending };
}
