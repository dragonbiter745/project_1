import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { CASHFREE_SECRET_KEY, CASHFREE_SECRETS, REGION } from '../config';
import { db } from '../db';
import { toPaise, verifyWebhookSignature } from '../lib/cashfree';
import { materializePaidOrder } from '../lib/orders';

interface WebhookEvent {
  type?: string;
  data?: {
    order?: { order_id?: string; order_amount?: number; order_currency?: string };
    payment?: { payment_status?: string; payment_amount?: number; cf_payment_id?: string | number; payment_group?: string };
    refund?: { refund_id?: string; refund_status?: string; cf_refund_id?: string | number; order_id?: string };
  };
}

/**
 * Cashfree payment and refund notifications. Every request must carry a valid signature; anything
 * else is rejected before it can touch an order. Handling is idempotent, so Cashfree retries are safe.
 */
export const cashfreeWebhook = onRequest({ region: REGION, secrets: CASHFREE_SECRETS, cors: false, maxInstances: 50, concurrency: 80, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  const timestamp = req.get('x-webhook-timestamp');
  const signature = req.get('x-webhook-signature');
  const rawBody = req.rawBody?.toString('utf8');
  if (!timestamp || !signature || !rawBody || !verifyWebhookSignature(rawBody, timestamp, signature, CASHFREE_SECRET_KEY.value())) {
    logger.warn('Rejected unsigned or badly signed webhook', { ip: req.ip });
    res.status(401).send('Invalid signature');
    return;
  }

  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody) as WebhookEvent;
  } catch {
    res.status(400).send('Bad payload');
    return;
  }

  try {
    if (event.type === 'REFUND_STATUS_WEBHOOK' && event.data?.refund?.refund_id) {
      const r = event.data.refund;
      const ticket = await db.collection('subOrders').where('refund.refundId', '==', r.refund_id).limit(1).get();
      const doc = ticket.docs[0];
      if (doc) {
        const status = r.refund_status === 'SUCCESS' ? 'PROCESSED' : r.refund_status === 'CANCELLED' || r.refund_status === 'FAILED' ? 'FAILED' : 'PENDING';
        await doc.ref.update({ 'refund.status': status, 'refund.cfRefundId': String(r.cf_refund_id ?? ''), 'refund.updatedAt': Date.now() });
      }
      res.status(200).json({ ok: true });
      return;
    }

    const orderId = event.data?.order?.order_id;
    const status = event.data?.payment?.payment_status;
    if (!orderId) {
      res.status(400).send('Missing order_id');
      return;
    }

    if (status === 'SUCCESS') {
      if (event.data?.order?.order_currency && event.data.order.order_currency !== 'INR') {
        logger.error('Non-INR payment', { orderId });
        res.status(400).send('Unsupported currency');
        return;
      }
      const amountPaise = toPaise(event.data?.payment?.payment_amount ?? event.data?.order?.order_amount ?? 0);
      const outcome = await materializePaidOrder(orderId, {
        amountPaise,
        cfPaymentId: event.data?.payment?.cf_payment_id != null ? String(event.data.payment.cf_payment_id) : null,
        method: event.data?.payment?.payment_group ?? null,
      });
      if (outcome === 'amount-mismatch') {
        // Paid amount differs from what we computed: never fulfil it automatically.
        logger.error('Payment amount mismatch', { orderId, amountPaise });
        await db.collection('orders').doc(orderId).update({ 'payment.status': 'FLAGGED', updatedAt: Date.now() });
      }
      res.status(200).json({ ok: true, outcome });
      return;
    }

    if (status === 'FAILED' || status === 'USER_DROPPED' || status === 'CANCELLED') {
      // The order stays payable until it expires, so the diner can retry from the same screen.
      await db.collection('orders').doc(orderId).set({ payment: { lastAttempt: status, lastAttemptAt: Date.now() } }, { merge: true });
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error('Webhook handling failed', { err: (err as Error).message });
    res.status(500).send('Retry later');
  }
});
