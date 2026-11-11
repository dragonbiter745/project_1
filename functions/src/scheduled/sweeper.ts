import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { canTransitionOrder, canTransitionSubOrder, type Order, type SubOrder, type Vendor } from '@foodcourt/shared';
import { DEFAULT_ACCEPT_SLA_SEC, RAZORPAY_SECRETS, REGION } from '../config';
import { db } from '../db';
import { getCapturedPayment } from '../lib/razorpay';
import { materializePaidOrder, syncParentStatus } from '../lib/orders';
import { refundOwed, sweepRefunds } from '../lib/refunds';

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
    try {
      const timedOut = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        const t = fresh.data() as SubOrder | undefined;
        if (!t || !canTransitionSubOrder(t.status, 'TIMED_OUT')) return false;
        if (now - t.ts.placed < (sla.get(t.vendorId) ?? DEFAULT_ACCEPT_SLA_SEC * 1000)) return false;
        // The refund owed is written with the timeout itself, so it exists even if no trigger ever runs.
        tx.update(doc.ref, { status: 'TIMED_OUT', 'ts.timedOut': now, updatedAt: now, refund: refundOwed(t.paymentMode, now) });
        return true;
      });
      if (timedOut) {
        n++;
        parents.add(placed.orderId);
      }
    } catch (err) {
      // One ticket that cannot be timed out must not stop the others (or the rest of the sweep).
      logger.error('Sweeper step failed', { step: 'timeout-ticket', subOrderId: doc.id, err: (err as Error).message });
    }
  }
  for (const id of parents) {
    await syncParentStatus(id).catch((err) => logger.error('Sweeper step failed', { step: 'sync-parent', orderId: id, err: (err as Error).message }));
  }
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

/** Runs one part of the sweep on its own: if it throws, the failure is logged at ERROR (an alert watches for it) and the other parts still run. */
export async function sweepStep<T>(step: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logger.error('Sweeper step failed', { step, err: (err as Error).message });
    return fallback;
  }
}

/** One full sweep. Each part is independent: a bug or an outage in one never stops payments being recovered or refunds being sent. */
export async function sweep(): Promise<void> {
  const timedOut = await sweepStep('timeouts', () => timeOutUnaccepted(), 0);
  const payments = await sweepStep('payments', () => reconcilePayments(), { paid: 0, expired: 0 });
  const refunds = await sweepStep('refunds', () => sweepRefunds(), { sent: 0, settled: 0 });
  if (timedOut || payments.paid || payments.expired || refunds.sent || refunds.settled) logger.info('Sweep', { timedOut, ...payments, refundsSent: refunds.sent, refundsSettled: refunds.settled });
}

// Every minute, around the clock. A payment or a refund can be owed at any hour (a late UPI approval, an order
// placed just before closing), and an idle sweep is four small queries, so there is no hour worth skipping.
export const sweeper = onSchedule({ schedule: '* * * * *', timeZone: 'Asia/Kolkata', region: REGION, secrets: RAZORPAY_SECRETS, timeoutSeconds: 120, maxInstances: 1, retryCount: 0 }, sweep);
