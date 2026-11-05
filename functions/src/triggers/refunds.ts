import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { REFUNDABLE_STATUSES, type Order, type SubOrder } from '@foodcourt/shared';
import { RAZORPAY_SECRETS, DATABASE, REGION } from '../config';
import { db } from '../db';
import { createRefund } from '../lib/razorpay';
import { refundShare } from '../lib/orders';

/** Decides what a ticket that just failed (rejected, cancelled, timed out) owes the diner. */
export async function refundTicket(subOrderId: string, before: SubOrder, after: SubOrder): Promise<'refunded' | 'not-required' | 'skipped'> {
  if (!REFUNDABLE_STATUSES.has(after.status) || REFUNDABLE_STATUSES.has(before.status) || after.refund?.refundId) return 'skipped';
  const ref = db.collection('subOrders').doc(subOrderId);
  const order = (await db.collection('orders').doc(after.orderId).get()).data() as Order | undefined;
  const paidOnline = order?.payment.mode === 'ONLINE' && order.payment.status === 'SUCCESS' && !!order.payment.rzpPaymentId;
  if (!order || !paidOnline) {
    await ref.update({ refund: { status: 'NOT_REQUIRED', amountPaise: 0, updatedAt: Date.now() } });
    return 'not-required';
  }
  const amountPaise = refundShare(order, after.subtotalPaise);
  const refundId = `rf_${subOrderId}`.slice(0, 40);
  await ref.update({ refund: { status: 'PENDING', amountPaise, refundId, updatedAt: Date.now() } });
  try {
    const r = await createRefund(order.payment.rzpPaymentId as string, refundId, amountPaise, `${after.token} ${after.status.toLowerCase()}`);
    await ref.update({ 'refund.status': r.status === 'processed' ? 'PROCESSED' : r.status === 'failed' ? 'FAILED' : 'PENDING', 'refund.gatewayRefundId': r.id, 'refund.updatedAt': Date.now() });
  } catch (err) {
    // Stays PENDING with its refundId; the sweeper keeps checking and the master console shows it.
    logger.error('Refund request failed', { subOrderId, err: (err as Error).message });
  }
  return 'refunded';
}

export const onTicketFailed = onDocumentUpdated({ document: 'subOrders/{id}', database: DATABASE, region: REGION, secrets: RAZORPAY_SECRETS, retry: false }, async (event) => {
  const before = event.data?.before.data() as SubOrder | undefined;
  const after = event.data?.after.data() as SubOrder | undefined;
  if (!before || !after || before.status === after.status) return;
  await refundTicket(event.params.id, before, after);
});
