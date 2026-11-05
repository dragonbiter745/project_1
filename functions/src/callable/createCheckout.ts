import * as crypto from 'crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import {
  CreateCheckoutSchema,
  computeOrderTotals,
  getIstDateKey,
  withDiscount,
  type GlobalConfig,
  type Order,
  type Vendor,
  type VendorAvailability,
  type VendorMenu,
  PICKUP_TABLE_ID,
} from '@foodcourt/shared';
import { PAYMENT_WINDOW_MS, RAZORPAY_KEY_ID, RAZORPAY_SECRETS, REGION } from '../config';
import { db } from '../db';
import { createOrder, MIN_AMOUNT_PAISE, RazorpayError } from '../lib/razorpay';
import { clientIp, limitLocal, limitShared, requireUid } from '../lib/guard';
import { discountForCheckout, holdCoupon, releaseHold } from '../lib/coupons';
import { writeCustomerOrder } from '../lib/customers';
import { signInProvider } from './account';
import { readForTickets, retryContention, writeTickets } from '../lib/orders';

const FALLBACK_CONFIG: GlobalConfig = {
  pointsPerRupee: 0.1,
  pointsExpiryDays: 90,
  gstPct: 5,
  taxInclusive: true,
  platformFeePaise: 0,
  flags: { paymentsEnabled: true, loyaltyEnabled: false, maintenance: false },
};

/**
 * Prices, stock and shop status are recomputed here from Firestore; nothing the phone sends about
 * money is trusted. The same (diner, checkoutKey) always maps to the same order, so double taps and
 * retries cannot create a second order or a second payment.
 */
/** The first of two simultaneous checkouts is creating the Razorpay order: wait (briefly) for its id. */
async function awaitFirstCheckout(orderRef: FirebaseFirestore.DocumentReference, orderId: string) {
  for (let i = 0; i < 16; i++) {
    const o = (await orderRef.get()).data() as Order | undefined;
    if (o && (o.payment.rzpOrderId || o.status !== 'PENDING_PAYMENT')) {
      return { orderId, status: o.status, razorpayOrderId: o.payment.rzpOrderId ?? null, razorpayKeyId: RAZORPAY_KEY_ID.value(), totalPaise: o.totals.totalPaise };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new HttpsError('aborted', 'Your order is still being set up. Tap Pay again in a moment.');
}

export const createCheckout = onCall(
  { region: REGION, secrets: RAZORPAY_SECRETS, maxInstances: 100, concurrency: 80, timeoutSeconds: 30, memory: '512MiB' },
  async (req) => {
    const uid = requireUid(req);
    limitLocal(`ip:${clientIp(req)}:checkout`, 600, 60);
    // A diner places one or two orders; six attempts in ten minutes is generous, and each one can create a gateway order.
    await limitShared(`checkout:${uid}`, 6, 600);

    const parsed = CreateCheckoutSchema.safeParse(req.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid order.');
    const { sessionId, checkoutKey, items, customerPhone, couponCode } = parsed.data;

    const orderId = 'o' + crypto.createHash('sha256').update(`${uid}:${checkoutKey}`).digest('hex').slice(0, 24);
    const orderRef = db.collection('orders').doc(orderId);
    const [sessionSnap, configSnap, existingSnap] = await Promise.all([db.collection('sessions').doc(sessionId).get(), db.collection('config').doc('global').get(), orderRef.get()]);

    if (existingSnap.exists) {
      const o = existingSnap.data() as Order;
      return { orderId, status: o.status, razorpayOrderId: o.payment.rzpOrderId ?? null, razorpayKeyId: RAZORPAY_KEY_ID.value(), totalPaise: o.totals.totalPaise };
    }

    const now = Date.now();
    const session = sessionSnap.data();
    const pickup = session?.tableId === PICKUP_TABLE_ID;
    if (!session || session.uid !== uid || (session.expiresAt as number) < now) {
      throw new HttpsError('failed-precondition', pickup ? 'Your order session ended. Refresh the page and try again.' : 'Your table session ended. Scan the QR on your table again.');
    }
    const provider = signInProvider(req);
    const member = Boolean(provider && provider !== 'anonymous');
    const config = (configSnap.exists ? configSnap.data() : FALLBACK_CONFIG) as GlobalConfig;
    if (config.flags.maintenance) throw new HttpsError('unavailable', 'Ordering is paused for a few minutes. Please try again shortly.');
    // Pickup orders come from people who are not at a table yet, signed in or not: paid up front only.
    if (pickup && !config.flags.paymentsEnabled) throw new HttpsError('failed-precondition', 'Online orders are paused. Scan the QR on a table at the court to order.');

    // Read every shop's menu, stock and status in parallel.
    const vendorIds = [...new Set(items.map((i) => i.vendorId))];
    const docs = await Promise.all(
      vendorIds.flatMap((v) => [db.collection('menus').doc(v).get(), db.collection('availability').doc(v).get(), db.collection('vendors').doc(v).get()])
    );
    const verified = items.map((line) => {
      const k = vendorIds.indexOf(line.vendorId) * 3;
      const menu = docs[k]!.data() as VendorMenu | undefined;
      const stock = docs[k + 1]!.data() as VendorAvailability | undefined;
      const vendor = docs[k + 2]!.data() as Vendor | undefined;
      if (!menu || !vendor || vendor.status !== 'active') throw new HttpsError('failed-precondition', 'One of the shops in your cart is closed right now.');
      const paused = !vendor.acceptingOrders || (vendor.pausedUntil && Date.parse(vendor.pausedUntil) > now);
      if (paused) throw new HttpsError('failed-precondition', `${vendor.name} is not taking orders right now.`);
      const category = menu.categories.find((c) => c.items.some((i) => i.id === line.itemId));
      const item = category?.items.find((i) => i.id === line.itemId);
      if (!category || !item) throw new HttpsError('not-found', `"${line.name}" is no longer on the menu.`);
      if (stock?.unavailable?.[item.id]) throw new HttpsError('failed-precondition', `"${item.name}" just sold out. Please update your cart.`);
      return { itemId: item.id, vendorId: line.vendorId, categoryId: category.id, name: item.name, pricePaise: item.pricePaise, veg: item.veg, qty: line.qty, ...(line.note ? { note: line.note } : {}) };
    });

    const fullTotals = computeOrderTotals({ items: verified, config });
    if (fullTotals.totalPaise < 100) throw new HttpsError('invalid-argument', 'That order is too small.');

    // Coupons are paid by the court and only work online: at the counter the shop holds the cash.
    let coupon: { code: string; title: string; discountPaise: number } | null = null;
    if (couponCode) {
      if (!config.flags.paymentsEnabled) throw new HttpsError('failed-precondition', 'Coupons work with online payment, which is off right now. Remove the coupon to order.');
      const found = await discountForCheckout(couponCode, uid, member, verified, fullTotals.totalPaise, now);
      coupon = { code: found.coupon.code, title: found.coupon.title, discountPaise: found.discountPaise };
    }
    const totals = withDiscount(fullTotals, coupon?.discountPaise ?? 0);

    const base = {
      sessionId,
      uid,
      tableId: session.tableId as string,
      tableLabel: session.tableLabel as string,
      displayName: session.displayName as string,
      dateKey: getIstDateKey(),
      items: verified,
      totals,
      checkoutKey,
      createdAt: now,
      ...(coupon ? { coupon, couponCostPaise: coupon.discountPaise } : {}),
    };

    // Pay at the counter: the order is confirmed and goes to the kitchens straight away.
    if (!config.flags.paymentsEnabled) {
      // Nothing is paid here to slow a prankster down, so each session and each table gets a small allowance
      // (a table of six ordering twice each fits well inside it). Retries of the same order never reach this line.
      await limitShared(`counter:session:${sessionId}`, 3, 900);
      await limitShared(`counter:table:${session.tableId as string}`, 30, 900);
      await retryContention(() => db.runTransaction(async (tx) => {
        const fresh = await tx.get(orderRef);
        if (fresh.exists) return;
        const reads = await readForTickets(tx, orderId, base);
        tx.set(orderRef, { ...base, status: 'PAID', payment: { status: 'PENDING', mode: 'COUNTER' } });
        writeTickets(tx, orderId, base, reads, now, 'COUNTER');
        writeCustomerOrder(tx, base, now);
      }));
      return { orderId, status: 'PAID', razorpayOrderId: null, razorpayKeyId: null, totalPaise: totals.totalPaise };
    }

    if (totals.totalPaise < MIN_AMOUNT_PAISE) throw new HttpsError('failed-precondition', 'Online payment needs a total of at least ₹1. Pay at the counter instead.');
    const expiresAt = now + PAYMENT_WINDOW_MS;
    if (coupon) await holdCoupon(coupon.code, uid, orderId, expiresAt, now);
    try {
      await orderRef.create({ ...base, status: 'PENDING_PAYMENT', payment: { status: 'PENDING', mode: 'ONLINE' }, ...(customerPhone ? { customerPhone } : {}), expiresAt });
    } catch (err) {
      if ((err as { code?: number }).code !== 6) throw err; // 6 = ALREADY_EXISTS
      // A double tap (or a network retry) raced the first request: wait for it and hand back the same order.
      return awaitFirstCheckout(orderRef, orderId);
    }

    try {
      // Amount is the server-recomputed total in integer paise; Razorpay takes paise as-is.
      const rzp = await createOrder({ orderId, amountPaise: totals.totalPaise });
      if (!rzp.id) throw new RazorpayError(502, 'No order id returned');
      await orderRef.update({ 'payment.rzpOrderId': rzp.id });
      return { orderId, status: 'PENDING_PAYMENT', razorpayOrderId: rzp.id, razorpayKeyId: RAZORPAY_KEY_ID.value(), totalPaise: totals.totalPaise };
    } catch (err) {
      logger.error('Razorpay order creation failed', { orderId, err: (err as Error).message });
      await orderRef.update({ status: 'FAILED', 'payment.status': 'FAILED', updatedAt: Date.now() });
      if (coupon) await releaseHold(coupon.code, uid);
      throw new HttpsError('unavailable', 'Payments are not responding right now. Nothing was charged. Please try again.');
    }
  }
);
