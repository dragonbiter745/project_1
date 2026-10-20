import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { evaluateCoupon, normaliseCode, type Coupon, type CouponLine, type CustomerRecord, type Order } from '@foodcourt/shared';
import { db } from '../db';

// Coupon checks for checkout, and the bookkeeping once a discounted order is paid. The court pays
// the discount, so nothing here touches a shop's ticket or commission.

export const couponRef = (code: string) => db.collection('coupons').doc(code);
const useRef = (code: string, uid: string) => db.collection('couponUses').doc(`${code}_${uid}`);
const holdRef = (code: string, uid: string) => db.collection('couponHolds').doc(`${code}_${uid}`);

export interface DinerContext {
  member: boolean;
  previousOrders: number;
  usedByDiner: number;
}

/** What the server knows about this diner and this coupon, read fresh each time. */
export async function dinerContext(code: string, uid: string, member: boolean): Promise<DinerContext> {
  const [customer, use] = await Promise.all([db.collection('customers').doc(uid).get(), useRef(code, uid).get()]);
  return {
    member,
    previousOrders: (customer.data() as Partial<CustomerRecord> | undefined)?.orders ?? 0,
    usedByDiner: (use.data()?.count as number | undefined) ?? 0,
  };
}

export async function readCoupon(rawCode: string): Promise<Coupon> {
  const code = normaliseCode(rawCode);
  const snap = await couponRef(code).get();
  if (!snap.exists) throw new HttpsError('not-found', 'No coupon with that code. Check it and try again.');
  return { ...(snap.data() as Coupon), code };
}

/**
 * Works out the discount for a checkout, from the coupon and the diner as they are now (never from
 * anything the phone sent). Throws a message the diner can act on when it does not apply.
 */
export async function discountForCheckout(
  rawCode: string,
  uid: string,
  member: boolean,
  lines: CouponLine[],
  totalBeforePaise: number,
  now: number
): Promise<{ coupon: Coupon; discountPaise: number }> {
  const coupon = await readCoupon(rawCode);
  const ctx = await dinerContext(coupon.code, uid, member);
  const result = evaluateCoupon(coupon, lines, { now, totalBeforePaise, ...ctx });
  if (!result.ok) throw new HttpsError('failed-precondition', result.reason);
  return { coupon, discountPaise: result.discountPaise };
}

/**
 * One coupon, one payment at a time: a diner cannot open two payment windows with the same
 * single-use coupon and pay both. The hold lapses with the payment window.
 */
export async function holdCoupon(code: string, uid: string, orderId: string, expiresAt: number, now: number): Promise<void> {
  const ref = holdRef(code, uid);
  await db.runTransaction(async (tx) => {
    const hold = (await tx.get(ref)).data() as { orderId: string; expiresAt: number } | undefined;
    if (hold && hold.orderId !== orderId && hold.expiresAt > now) {
      throw new HttpsError('failed-precondition', 'This coupon is already in another payment. Finish or close that one first.');
    }
    tx.set(ref, { orderId, expiresAt, code, uid });
  });
}

export const releaseHold = (code: string, uid: string) => holdRef(code, uid).delete();

/** Counts a coupon use when its order is paid. Writes only, so it fits after the payment transaction's reads. */
export function writeCouponUse(tx: Transaction, order: Pick<Order, 'uid' | 'coupon'>, now: number): void {
  const c = order.coupon;
  if (!c || !order.uid) return;
  tx.set(couponRef(c.code), { usedCount: FieldValue.increment(1), discountGivenPaise: FieldValue.increment(c.discountPaise), lastUsedAt: now }, { merge: true });
  tx.set(useRef(c.code, order.uid), { code: c.code, uid: order.uid, count: FieldValue.increment(1), lastUsedAt: now }, { merge: true });
  tx.delete(holdRef(c.code, order.uid));
}

/** Every shop's part of a paid order failed and was refunded: the diner gets their coupon use back, once. */
export async function releaseCouponUse(orderId: string): Promise<boolean> {
  const ref = db.collection('orders').doc(orderId);
  return db.runTransaction(async (tx) => {
    const order = (await tx.get(ref)).data() as Order | undefined;
    const c = order?.coupon;
    if (!order || !c || c.released || order.payment.status !== 'SUCCESS') return false;
    tx.update(ref, { 'coupon.released': true, couponCostPaise: 0 });
    tx.set(couponRef(c.code), { usedCount: FieldValue.increment(-1), discountGivenPaise: FieldValue.increment(-c.discountPaise) }, { merge: true });
    tx.set(useRef(c.code, order.uid), { count: FieldValue.increment(-1) }, { merge: true });
    return true;
  });
}
