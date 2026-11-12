import { logger } from 'firebase-functions/v2';
import type { Order } from '@foodcourt/shared';
import { db } from '../db';
import { materializePaidOrder, type Materialized } from './orders';
import { createRefund, getRefund, RazorpayError } from './razorpay';

// What to do with money Razorpay captured. Either the order is still payable and becomes a paid order
// with kitchen tickets, or it is not (it expired before the money arrived, or the amount is wrong) and the
// whole payment goes straight back. There is no third state where we hold a diner's money for nothing.

export interface Capture {
  amountPaise: number;
  rzpPaymentId?: string | null;
  method?: string | null;
}

type LateRefund = NonNullable<Order['lateRefund']>;
const FULFILLED = new Set(['PAID', 'COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED']);
const lateRefundId = (orderId: string) => `rl_${orderId}`.slice(0, 40);

/** Settles a captured payment: fulfils the order, or refunds it in full when it can no longer be fulfilled. */
export async function settleCapture(orderId: string, payment: Capture): Promise<Materialized> {
  const outcome = await materializePaidOrder(orderId, payment);
  if (outcome === 'late' || outcome === 'amount-mismatch') await refundCapture(orderId, payment, outcome);
  return outcome;
}

/** Records, exactly once, that this payment is owed back in full, then sends the refund. */
async function refundCapture(orderId: string, payment: Capture, reason: LateRefund['reason']): Promise<void> {
  const paymentId = payment.rzpPaymentId;
  if (!paymentId || payment.amountPaise <= 0) {
    logger.error('Refund not sent', { orderId, reason, err: 'capture without a payment id or amount' });
    return;
  }
  const ref = db.collection('orders').doc(orderId);
  const now = Date.now();
  const claimed = await db.runTransaction(async (tx) => {
    const order = (await tx.get(ref)).data() as Order | undefined;
    // Re-checked inside the transaction: an order that became paid in the meantime is never refunded here.
    if (!order || FULFILLED.has(order.status)) return null;
    if (order.lateRefund) return { late: order.lateRefund, isNew: false };
    const late: LateRefund = { status: 'PENDING', reason, amountPaise: payment.amountPaise, paymentId, refundId: lateRefundId(orderId), createdAt: now };
    const updates: Record<string, unknown> = { lateRefund: late, 'payment.rzpPaymentId': paymentId, updatedAt: now };
    if (reason === 'amount-mismatch') {
      updates['payment.status'] = 'FLAGGED';
      if (order.status === 'PENDING_PAYMENT') updates.status = 'FAILED';
    }
    tx.update(ref, updates);
    return { late, isNew: true };
  });
  if (!claimed) return;
  if (claimed.isNew) {
    if (reason === 'amount-mismatch') logger.error('Payment amount mismatch', { orderId, amountPaise: payment.amountPaise, rzpPaymentId: paymentId });
    else logger.warn('Late payment refunded', { orderId, amountPaise: payment.amountPaise, rzpPaymentId: paymentId });
  }
  if (claimed.late.status === 'PENDING' && !claimed.late.gatewayRefundId) await sendLateRefund(orderId, claimed.late);
}

/** Records Razorpay's answer. PROCESSED is final; a failure opens an issue for the manager and logs at ERROR. */
async function setLateRefund(orderId: string, status: LateRefund['status'], gatewayRefundId?: string, failReason?: string): Promise<void> {
  const ref = db.collection('orders').doc(orderId);
  const now = Date.now();
  const failed = await db.runTransaction(async (tx) => {
    const order = (await tx.get(ref)).data() as Order | undefined;
    const late = order?.lateRefund;
    if (!order || !late || late.status === 'PROCESSED') return null;
    const updates: Record<string, unknown> = { 'lateRefund.status': status, 'lateRefund.updatedAt': now };
    if (gatewayRefundId) updates['lateRefund.gatewayRefundId'] = gatewayRefundId;
    tx.update(ref, updates);
    if (status !== 'FAILED' || late.status === 'FAILED') return null;
    tx.set(db.collection('issues').doc(`late_${orderId}`), {
      orderId,
      subOrderId: null,
      vendorId: null,
      reason: 'refund_failed',
      text: `Refund of ${late.amountPaise} paise for a payment that arrived after its order closed failed${failReason ? `: ${failReason.slice(0, 200)}` : ''}. Refund payment ${late.paymentId} from the Razorpay dashboard.`,
      uid: order.uid ?? null,
      status: 'open',
      createdAt: now,
    });
    return late;
  });
  if (failed) logger.error('Refund failed', { orderId, amountPaise: failed.amountPaise, rzpPaymentId: failed.paymentId, failReason: failReason ?? null });
}

const permanent = (err: unknown) => err instanceof RazorpayError && err.status >= 400 && err.status < 500 && err.status !== 429 && err.status !== 408;

async function sendLateRefund(orderId: string, late: LateRefund): Promise<void> {
  try {
    const r = await createRefund(late.paymentId, late.refundId, late.amountPaise, `order ${late.reason}`);
    await setLateRefund(orderId, r.status === 'processed' ? 'PROCESSED' : r.status === 'failed' ? 'FAILED' : 'PENDING', r.id);
  } catch (err) {
    const message = (err as Error).message;
    if (permanent(err)) await setLateRefund(orderId, 'FAILED', undefined, message);
    else logger.error('Refund request failed', { orderId, err: message }); // stays PENDING; the sweeper sends it again
  }
}

/** Sweeper: re-sends any full refund that never got an answer and polls the ones Razorpay has not finished. */
export async function sweepLateRefunds(): Promise<number> {
  const pending = await db.collection('orders').where('lateRefund.status', '==', 'PENDING').limit(100).get();
  let settled = 0;
  for (let i = 0; i < pending.docs.length; i += 10) {
    await Promise.all(
      pending.docs.slice(i, i + 10).map(async (doc) => {
        const late = (doc.data() as Order).lateRefund!;
        try {
          if (!late.gatewayRefundId) return await sendLateRefund(doc.id, late);
          const r = await getRefund(late.gatewayRefundId);
          if (r.status === 'pending') return;
          await setLateRefund(doc.id, r.status === 'processed' ? 'PROCESSED' : 'FAILED', r.id);
          settled++;
        } catch (err) {
          logger.warn('Refund status check failed', { orderId: doc.id, err: (err as Error).message });
        }
      })
    );
  }
  return settled;
}

/** Webhook: a refund notification whose receipt is an order-level refund. Returns false if it is not one of these. */
export async function settleLateRefundByReceipt(receipt: string, status: 'PROCESSED' | 'FAILED', gatewayRefundId?: string): Promise<boolean> {
  const match = await db.collection('orders').where('lateRefund.refundId', '==', receipt).limit(1).get();
  const doc = match.docs[0];
  if (!doc) return false;
  await setLateRefund(doc.id, status, gatewayRefundId);
  return true;
}
