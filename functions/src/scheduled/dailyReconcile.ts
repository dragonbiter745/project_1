import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import type { Order } from '@foodcourt/shared';
import { RAZORPAY_SECRETS, REGION } from '../config';
import { db } from '../db';
import { listReceivedPayments } from '../lib/razorpay';
import { settleCapture } from '../lib/payments';

const IST_OFFSET_MS = 5.5 * 3600_000;
const DONE = new Set(['PAID', 'PREPARING', 'READY', 'COMPLETED', 'PARTIALLY_FULFILLED', 'CANCELLED', 'REFUNDED']);

export interface Discrepancy {
  kind: 'paid-at-gateway-not-in-books' | 'in-books-not-at-gateway' | 'amount-differs' | 'unknown-gateway-payment';
  rzpPaymentId?: string;
  orderId?: string;
  gatewayPaise?: number;
  bookPaise?: number;
}

export interface ReconciliationReport {
  dateKey: string;
  ranAt: number;
  gatewayCount: number;
  gatewayPaise: number;
  bookCount: number;
  bookPaise: number;
  healed: number;
  /** Payments that arrived after their order had closed and were sent back in full. */
  lateRefunded?: number;
  discrepancies: number;
  samples: Discrepancy[];
  ok: boolean;
}

/** The IST calendar day as [start, end) in epoch seconds, from a YYYY-MM-DD key. */
export function istDayRange(dateKey: string): { fromSec: number; toSec: number } {
  const start = Date.parse(`${dateKey}T00:00:00Z`) - IST_OFFSET_MS;
  return { fromSec: Math.floor(start / 1000), toSec: Math.floor((start + 86_400_000) / 1000) };
}

/**
 * Compares the day's money at the gateway with the money in our books, in both directions.
 *  - Captured at Razorpay but the order is not paid here: settle it now (a missed webhook); if the amount
 *    differs it is reported, never auto-fulfilled.
 *  - Marked paid here but Razorpay has no such captured payment: reported (the dangerous direction).
 * The report is stored in reconciliationReports/{dateKey}; any discrepancy also logs at ERROR so an alert fires.
 */
export async function reconcileDay(dateKey: string): Promise<ReconciliationReport> {
  const { fromSec, toSec } = istDayRange(dateKey);
  // A day's orders can be paid just after midnight and a payment can predate its order's date key, so books are
  // read with an hour of slack on each side and only judged on the payments actually inside the day.
  const gateway = await listReceivedPayments(fromSec - 3600, toSec + 3600);
  const orders = await db.collection('orders').where('dateKey', 'in', [dateKey]).get();
  const byRzp = new Map<string, { id: string; o: Order }>();
  const byPayment = new Map<string, { id: string; o: Order }>();
  for (const d of orders.docs) {
    const o = d.data() as Order;
    if (o.payment?.rzpOrderId) byRzp.set(o.payment.rzpOrderId, { id: d.id, o });
    if (o.payment?.rzpPaymentId) byPayment.set(o.payment.rzpPaymentId, { id: d.id, o });
  }

  const samples: Discrepancy[] = [];
  let discrepancies = 0;
  let healed = 0;
  let lateRefunded = 0;
  const flag = (d: Discrepancy) => {
    discrepancies++;
    if (samples.length < 50) samples.push(d);
  };

  let gatewayPaise = 0;
  let gatewayCount = 0;
  // Every id Razorpay reported (with the hour of slack): a book entry is only "missing" if it is in none of them.
  const seenPayments = new Set<string>(gateway.map((p) => p.id));
  for (const p of gateway) {
    // Only the payments created inside this IST day are judged and totalled; the slack hour just avoids false alarms.
    if (typeof p.created_at === 'number' && (p.created_at < fromSec || p.created_at >= toSec)) continue;
    const match = byRzp.get(p.order_id) ?? byPayment.get(p.id);
    if (!match) {
      // Could be another product on the same Razorpay account, or an order from the neighbouring day.
      const other = await db.collection('orders').where('payment.rzpOrderId', '==', p.order_id).limit(1).get();
      if (other.empty) flag({ kind: 'unknown-gateway-payment', rzpPaymentId: p.id, gatewayPaise: p.amount });
      continue;
    }
    gatewayCount++;
    gatewayPaise += p.amount;
    if (!DONE.has(match.o.status) && match.o.payment?.status !== 'SUCCESS') {
      // A refunded payment took no money in the end: nothing to settle (and nothing left to refund).
      if (p.status === 'refunded') continue;
      const outcome = await settleCapture(match.id, { amountPaise: p.amount, rzpPaymentId: p.id, method: 'RECONCILED' });
      if (outcome === 'created') healed++;
      // The order had closed before the money arrived: settleCapture sent it back in full. Not a difference.
      else if (outcome === 'late') lateRefunded++;
      else if (outcome === 'amount-mismatch') flag({ kind: 'amount-differs', rzpPaymentId: p.id, orderId: match.id, gatewayPaise: p.amount, bookPaise: match.o.totals.totalPaise });
      else if (outcome !== 'already') flag({ kind: 'paid-at-gateway-not-in-books', rzpPaymentId: p.id, orderId: match.id, gatewayPaise: p.amount });
    } else if (match.o.totals.totalPaise !== p.amount) {
      flag({ kind: 'amount-differs', rzpPaymentId: p.id, orderId: match.id, gatewayPaise: p.amount, bookPaise: match.o.totals.totalPaise });
    }
  }

  let bookPaise = 0;
  let bookCount = 0;
  for (const [id, { o }] of [...byRzp.values()].map((v) => [v.id, v] as const)) {
    if (o.payment?.status !== 'SUCCESS' || o.payment.mode === 'COUNTER') continue;
    bookCount++;
    bookPaise += o.totals.totalPaise;
    if (o.payment.rzpPaymentId && !seenPayments.has(o.payment.rzpPaymentId)) {
      flag({ kind: 'in-books-not-at-gateway', orderId: id, rzpPaymentId: o.payment.rzpPaymentId, bookPaise: o.totals.totalPaise });
    }
  }

  const report: ReconciliationReport = { dateKey, ranAt: Date.now(), gatewayCount, gatewayPaise, bookCount, bookPaise, healed, lateRefunded, discrepancies, samples, ok: discrepancies === 0 };
  await db.collection('reconciliationReports').doc(dateKey).set(report);
  if (!report.ok) logger.error('Reconciliation found differences between Razorpay and our books', { dateKey, discrepancies, gatewayPaise, bookPaise, samples: samples.slice(0, 5) });
  else logger.info('Reconciliation clean', { dateKey, gatewayCount, gatewayPaise, healed });
  return report;
}

const istKey = (ms: number) => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);

// 23:30 IST for today, and 06:30 IST for yesterday again, so late payments and webhook retries (24 h) are caught.
export const dailyReconcile = onSchedule({ schedule: '30 23 * * *', timeZone: 'Asia/Kolkata', region: REGION, secrets: RAZORPAY_SECRETS, timeoutSeconds: 540, maxInstances: 1, retryCount: 0 }, async () => {
  await reconcileDay(istKey(Date.now()));
});
export const morningReconcile = onSchedule({ schedule: '30 6 * * *', timeZone: 'Asia/Kolkata', region: REGION, secrets: RAZORPAY_SECRETS, timeoutSeconds: 540, maxInstances: 1, retryCount: 0 }, async () => {
  await reconcileDay(istKey(Date.now() - 86_400_000));
});
