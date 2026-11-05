import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { RAZORPAY_SECRETS, RAZORPAY_WEBHOOK_SECRET, REGION } from '../config';
import { db } from '../db';
import { verifyWebhookSignature } from '../lib/razorpay';
import { materializePaidOrder } from '../lib/orders';

interface PaymentEntity {
  id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  method?: string;
}
interface WebhookEvent {
  event?: string;
  payload?: {
    payment?: { entity?: PaymentEntity };
    refund?: { entity?: { id?: string; receipt?: string | null; status?: string } };
  };
}

/**
 * Razorpay payment and refund notifications: the source of truth for "paid". Every request must carry a
 * valid x-razorpay-signature; anything else is rejected before it can touch an order. Handling is
 * idempotent, so Razorpay retries (and the verifyPayment fast path racing us) are safe.
 */
export const razorpayWebhook = onRequest({ region: REGION, secrets: RAZORPAY_SECRETS, cors: false, maxInstances: 50, concurrency: 80, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  const signature = req.get('x-razorpay-signature');
  const rawBody = req.rawBody?.toString('utf8');
  if (!signature || !rawBody || !verifyWebhookSignature(rawBody, signature, RAZORPAY_WEBHOOK_SECRET.value())) {
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
    const refund = event.payload?.refund?.entity;
    if ((event.event === 'refund.processed' || event.event === 'refund.failed') && refund?.receipt) {
      const ticket = await db.collection('subOrders').where('refund.refundId', '==', refund.receipt).limit(1).get();
      const doc = ticket.docs[0];
      if (doc) {
        const status = event.event === 'refund.processed' ? 'PROCESSED' : 'FAILED';
        await doc.ref.update({ 'refund.status': status, 'refund.gatewayRefundId': refund.id ?? '', 'refund.updatedAt': Date.now() });
      }
      res.status(200).json({ ok: true });
      return;
    }

    const payment = event.payload?.payment?.entity;
    if (event.event !== 'payment.captured' && event.event !== 'order.paid' && event.event !== 'payment.failed') {
      res.status(200).json({ ok: true, ignored: true }); // other events are acknowledged so Razorpay stops retrying
      return;
    }
    if (!payment?.order_id) {
      res.status(400).send('Missing order_id');
      return;
    }
    const match = await db.collection('orders').where('payment.rzpOrderId', '==', payment.order_id).limit(1).get();
    const orderDoc = match.docs[0];
    if (!orderDoc) {
      // Not one of ours (or created before we recorded the id): acknowledge, there is nothing to settle.
      logger.warn('Webhook for unknown Razorpay order', { rzpOrderId: payment.order_id });
      res.status(200).json({ ok: true, outcome: 'missing' });
      return;
    }

    if (event.event === 'payment.failed') {
      // The order stays payable until it expires, so the diner can retry from the same screen.
      await orderDoc.ref.set({ payment: { lastAttempt: 'FAILED', lastAttemptAt: Date.now() } }, { merge: true });
      res.status(200).json({ ok: true });
      return;
    }

    if (payment.currency && payment.currency !== 'INR') {
      logger.error('Non-INR payment', { orderId: orderDoc.id });
      res.status(400).send('Unsupported currency');
      return;
    }
    const outcome = await materializePaidOrder(orderDoc.id, { amountPaise: payment.amount ?? 0, rzpPaymentId: payment.id ?? null, method: payment.method ?? null });
    if (outcome === 'amount-mismatch') {
      // Paid amount differs from what we computed: never fulfil it automatically.
      logger.error('Payment amount mismatch', { orderId: orderDoc.id, amountPaise: payment.amount });
      await orderDoc.ref.update({ 'payment.status': 'FLAGGED', updatedAt: Date.now() });
    }
    res.status(200).json({ ok: true, outcome });
  } catch (err) {
    logger.error('Webhook handling failed', { err: (err as Error).message });
    res.status(500).send('Retry later');
  }
});
