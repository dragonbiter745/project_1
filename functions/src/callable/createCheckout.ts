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
} from '@foodcourt/shared';
import { CASHFREE_SECRETS, CUSTOMER_URL, PAYMENT_WINDOW_MS, REGION } from '../config';
import { db } from '../db';
import { CashfreeError, createOrder, isProduction } from '../lib/cashfree';
import { clientIp, limitLocal, limitShared, requireUid } from '../lib/guard';
import { discountForCheckout, holdCoupon, releaseHold } from '../lib/coupons';
import { writeCustomerOrder } from '../lib/customers';
import { signInProvider } from './account';
import { readForTickets, writeTickets } from '../lib/orders';

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
export const createCheckout = onCall(
  { region: REGION, secrets: CASHFREE_SECRETS, minInstances: 1, maxInstances: 100, concurrency: 80, timeoutSeconds: 30, memory: '512MiB' },
  async (req) => {
    const uid = requireUid(req);
    limitLocal(`ip:${clientIp(req)}:checkout`, 600, 60);
    await limitShared(`checkout:${uid}`, 10, 600);

    const parsed = CreateCheckoutSchema.safeParse(req.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid order.');
    const { sessionId, checkoutKey, items, customerPhone, couponCode } = parsed.data;

    const orderId = 'o' + crypto.createHash('sha256').update(`${uid}:${checkoutKey}`).digest('hex').slice(0, 24);
    const orderRef = db.collection('orders').doc(orderId);
    const [sessionSnap, configSnap, existingSnap] = await Promise.all([db.collection('sessions').doc(sessionId).get(), db.collection('config').doc('global').get(), orderRef.get()]);

    if (existingSnap.exists) {
      const o = existingSnap.data() as Order;
      return { orderId, status: o.status, paymentSessionId: o.payment.paymentSessionId ?? null, cashfreeMode: isProduction() ? 'production' : 'sandbox', totalPaise: o.totals.totalPaise };
    }

    const now = Date.now();
    const session = sessionSnap.data();
    if (!session || session.uid !== uid || (session.expiresAt as number) < now) {
      throw new HttpsError('failed-precondition', 'Your table session ended. Scan the QR on your table again.');
    }
    const config = (configSnap.exists ? configSnap.data() : FALLBACK_CONFIG) as GlobalConfig;
    if (config.flags.maintenance) throw new HttpsError('unavailable', 'Ordering is paused for a few minutes. Please try again shortly.');

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
      const provider = signInProvider(req);
      const found = await discountForCheckout(couponCode, uid, Boolean(provider && provider !== 'anonymous'), verified, fullTotals.totalPaise, now);
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
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(orderRef);
        if (fresh.exists) return;
        const reads = await readForTickets(tx, orderId, base);
        tx.set(orderRef, { ...base, status: 'PAID', payment: { status: 'PENDING', mode: 'COUNTER' } });
        writeTickets(tx, orderId, base, reads, now, 'COUNTER');
        writeCustomerOrder(tx, base, now);
      });
      return { orderId, status: 'PAID', paymentSessionId: null, cashfreeMode: null, totalPaise: totals.totalPaise };
    }

    if (!customerPhone) throw new HttpsError('invalid-argument', 'Enter your mobile number to pay online.');
    const expiresAt = now + PAYMENT_WINDOW_MS;
    if (coupon) await holdCoupon(coupon.code, uid, orderId, expiresAt, now);
    await orderRef.create({ ...base, status: 'PENDING_PAYMENT', payment: { status: 'PENDING', mode: 'ONLINE' }, customerPhone, expiresAt });

    try {
      const cf = await createOrder({
        orderId,
        amountPaise: totals.totalPaise,
        customerId: uid,
        customerPhone,
        customerName: base.displayName || 'REVA diner',
        returnUrl: `${CUSTOMER_URL.value()}/t/${session.qrToken as string}?order_id={order_id}`,
        expiresAt: expiresAt + 60_000,
      });
      if (!cf.payment_session_id) throw new CashfreeError(502, 'No payment session returned');
      await orderRef.update({ 'payment.paymentSessionId': cf.payment_session_id, 'payment.cfOrderId': String(cf.cf_order_id ?? '') });
      return { orderId, status: 'PENDING_PAYMENT', paymentSessionId: cf.payment_session_id, cashfreeMode: isProduction() ? 'production' : 'sandbox', totalPaise: totals.totalPaise };
    } catch (err) {
      logger.error('Cashfree order creation failed', { orderId, err: (err as Error).message });
      await orderRef.update({ status: 'FAILED', 'payment.status': 'FAILED', updatedAt: Date.now() });
      if (coupon) await releaseHold(coupon.code, uid);
      throw new HttpsError('unavailable', 'Payments are not responding right now. Nothing was charged. Please try again.');
    }
  }
);
