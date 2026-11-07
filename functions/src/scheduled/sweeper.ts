import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { canTransitionOrder, canTransitionSubOrder, type Order, type SubOrder, type Vendor } from '@foodcourt/shared';
import { DEFAULT_ACCEPT_SLA_SEC, RAZORPAY_SECRETS, REGION } from '../config';
import { db } from '../db';
import { createRefund, getCapturedPayment, getRefund } from '../lib/razorpay';
import { materializePaidOrder, syncParentStatus } from '../lib/orders';

// Shops' accept deadlines change rarely, so a minute-by-minute sweep must not re-read every shop each time.
const SLA_TTL_MS = 10 * 60_000;
let slaCache: { at: number; map: Map<string, number> } | null = null;

async function acceptDeadlines(now: number): Promise<Map<string, number>> {
  if (slaCache && now >= slaCache.at && now - slaCache.at < SLA_TTL_MS) return slaCache.map;
  const vendors = await db.collection('vendors').get();
  const map = new Map(vendors.docs.map((d) => [d.id, ((d.data() as Vendor).acceptSlaSec || DEFAULT_ACCEPT_SLA_SEC) * 1000]));
  slaCache = { at: now, map };
  return map;
}

/** Tickets no kitchen accepted in time become TIMED_OUT (the refund trigger then pays the diner back). */
export async function timeOutUnaccepted(now = Date.now()): Promise<number> {
  // With nothing waiting this is a single query; the shops are read only once a ticket is overdue.
  const shortest = Math.min(...[...(slaCache?.map.values() ?? []), DEFAULT_ACCEPT_SLA_SEC * 1000]);
  const stale = await db.collection('subOrders').where('status', '==', 'NEW').where('ts.placed', '<', now - shortest).limit(300).get();
  if (stale.empty) return 0;
  const sla = await acceptDeadlines(now);
  let n = 0;
  const parents = new Set<string>();
  for (const doc of stale.docs) {
    const placed = doc.data() as SubOrder;
    if (now - placed.ts.placed < (sla.get(placed.vendorId) ?? DEFAULT_ACCEPT_SLA_SEC * 1000)) continue;
    const timedOut = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const t = fresh.data() as SubOrder | undefined;
      if (!t || !canTransitionSubOrder(t.status, 'TIMED_OUT')) return false;
      if (now - t.ts.placed < (sla.get(t.vendorId) ?? DEFAULT_ACCEPT_SLA_SEC * 1000)) return false;
      tx.update(doc.ref, { status: 'TIMED_OUT', 'ts.timedOut': now, updatedAt: now });
      return true;
    });
    if (timedOut) {
      n++;
      parents.add((doc.data() as SubOrder).orderId);
    }
  }
  for (const id of parents) await syncParentStatus(id);
  return n;
}

// An unpaid order is checked with Razorpay at these ages (whole minutes) and then every sweep once it is
// older than the last one: about eight calls instead of one per minute for orders nobody pays for. The
// payment window is 20 minutes, the order is expired here once it is 5 minutes past that (Razorpay orders never expire by themselves), and the age fallback applies from 26.
const CHECK_AT_MIN = new Set([2, 3, 5, 8, 12, 16, 21, 26]);
const CHECK_EVERY_AFTER_MIN = 26;

/**
 * Catches payments whose webhook never arrived, and expires orders nobody paid for. Oldest first and up to 500 a
 * minute, so a lunch rush of abandoned carts can never push a real payment out of the batch; the gateway calls
 * run ten at a time so a full batch still fits well inside the function's time limit.
 */
export async function reconcilePayments(now = Date.now()): Promise<{ paid: number; expired: number }> {
  const pending = await db.collection('orders').where('status', '==', 'PENDING_PAYMENT').where('createdAt', '<', now - 2 * 60_000).orderBy('createdAt').limit(500).get();
  let paid = 0;
  let expired = 0;
  const check = async (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
    const order = doc.data() as Order;
    const ageMin = Math.floor((now - order.createdAt) / 60_000);
    if (ageMin <= CHECK_EVERY_AFTER_MIN && !CHECK_AT_MIN.has(ageMin)) return;
    try {
      const captured = order.payment.rzpOrderId ? await getCapturedPayment(order.payment.rzpOrderId) : undefined;
      if (captured) {
        const outcome = await materializePaidOrder(doc.id, { amountPaise: captured.amount, rzpPaymentId: captured.id, method: captured.method ?? 'RECONCILED' });
        if (outcome === 'created') paid++;
        return;
      }
      const tooOld = now > (order.expiresAt ?? order.createdAt + 15 * 60_000) + 5 * 60_000;
      if (tooOld && canTransitionOrder('PENDING_PAYMENT', 'EXPIRED')) {
        await doc.ref.update({ status: 'EXPIRED', 'payment.status': 'FAILED', updatedAt: now });
        expired++;
      }
    } catch (err) {
      logger.warn('Reconcile failed for order', { orderId: doc.id, err: (err as Error).message });
    }
  };
  for (let i = 0; i < pending.docs.length; i += 10) await Promise.all(pending.docs.slice(i, i + 10).map(check));
  return { paid, expired };
}

/** Refunds Razorpay accepted but has not finished: poll until they settle. A refund whose request never got an answer is re-sent (idempotent on its id). */
export async function refreshRefunds(): Promise<number> {
  const pending = await db.collection('subOrders').where('refund.status', '==', 'PENDING').limit(300).get();
  let settled = 0;
  for (const doc of pending.docs) {
    const t = doc.data() as SubOrder;
    if (!t.refund?.refundId) continue;
    try {
      let r;
      if (t.refund.gatewayRefundId) {
        r = await getRefund(t.refund.gatewayRefundId);
      } else {
        const paymentId = ((await db.collection('orders').doc(t.orderId).get()).data() as Order | undefined)?.payment.rzpPaymentId;
        if (!paymentId) continue;
        r = await createRefund(paymentId, t.refund.refundId, t.refund.amountPaise, `${t.token} retry`);
        await doc.ref.update({ 'refund.gatewayRefundId': r.id });
      }
      if (r.status === 'pending') continue;
      await doc.ref.update({ 'refund.status': r.status === 'processed' ? 'PROCESSED' : 'FAILED', 'refund.updatedAt': Date.now() });
      settled++;
    } catch (err) {
      logger.warn('Refund status check failed', { subOrderId: doc.id, err: (err as Error).message });
    }
  }
  return settled;
}

// Every minute, but only while the court can be ordering (06:00-21:59 IST). Overnight there is nothing to
// sweep, and anything left over is settled at 06:00.
export const sweeper = onSchedule({ schedule: '* 6-21 * * *', timeZone: 'Asia/Kolkata', region: REGION, secrets: RAZORPAY_SECRETS, timeoutSeconds: 120, maxInstances: 1, retryCount: 0 }, async () => {
  const timedOut = await timeOutUnaccepted();
  const payments = await reconcilePayments();
  const refunds = await refreshRefunds();
  if (timedOut || payments.paid || payments.expired || refunds) logger.info('Sweep', { timedOut, ...payments, refunds });
});
