import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { RAZORPAY_SECRETS, RAZORPAY_WEBHOOK_SECRET, REGION } from '../config';
import { db } from '../db';
import { verifyWebhookSignature } from '../lib/razorpay';
import { settleCapture, settleLateRefundByReceipt } from '../lib/payments';
import { settleRefund } from '../lib/refunds';
import * as crypto from 'crypto';
import { recordPaymentEvent, setPaymentEventOutcome } from '../lib/ledger';

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
    dispute?: { entity?: { id?: string; payment_id?: string; amount?: number; reason_code?: string; status?: string; respond_by?: number; phase?: string } };
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

  // The ledger key: Razorpay's own event id (stable across redeliveries), or a hash of the signed body if absent.
  const eventId = (req.get('x-razorpay-event-id') || crypto.createHash('sha256').update(rawBody).digest('hex')).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120);
  const pay = event.payload?.payment?.entity;
  await recordPaymentEvent({
    eventId,
    event: String(event.event ?? 'unknown'),
    rzpOrderId: pay?.order_id ?? null,
    rzpPaymentId: pay?.id ?? event.payload?.refund?.entity?.id ?? null,
    amountPaise: typeof pay?.amount === 'number' ? pay.amount : null,
    currency: pay?.currency ?? null,
    method: pay?.method ?? null,
  });

  try {
    const refund = event.payload?.refund?.entity;
    if ((event.event === 'refund.processed' || event.event === 'refund.failed') && refund?.receipt) {
      const ticket = await db.collection('subOrders').where('refund.refundId', '==', refund.receipt).limit(1).get();
      const doc = ticket.docs[0];
      // settleRefund never moves a PROCESSED refund back, and a failure opens an issue for the manager.
      const status = event.event === 'refund.processed' ? 'PROCESSED' : 'FAILED';
      if (doc) await settleRefund(doc.id, status, refund.id || undefined);
      // Not a ticket's refund: it may be the full refund of a payment that arrived after its order closed.
      else await settleLateRefundByReceipt(refund.receipt, status, refund.id || undefined);
      res.status(200).json({ ok: true });
      return;
    }

    // A chargeback: the bank is taking a diner's payment back. Recorded, raised with the court manager, and
    // logged at ERROR so the alert fires; it must be answered in the Razorpay dashboard before respond_by.
    const dispute = event.payload?.dispute?.entity;
    if (event.event?.startsWith('payment.dispute.') && dispute?.id) {
      const now = Date.now();
      const id = dispute.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100);
      const order = dispute.payment_id ? (await db.collection('orders').where('payment.rzpPaymentId', '==', dispute.payment_id).limit(1).get()).docs[0] : undefined;
      await db.collection('disputes').doc(id).set(
        { disputeId: dispute.id, paymentId: dispute.payment_id ?? null, orderId: order?.id ?? null, amountPaise: dispute.amount ?? 0, reasonCode: dispute.reason_code ?? null, status: dispute.status ?? event.event.slice('payment.dispute.'.length), phase: dispute.phase ?? null, respondBy: dispute.respond_by ? dispute.respond_by * 1000 : null, lastEvent: event.event, updatedAt: now },
        { merge: true }
      );
      if (event.event === 'payment.dispute.created') {
        await db.collection('issues').doc(`dispute_${id}`).set({ orderId: order?.id ?? null, subOrderId: null, vendorId: null, reason: 'chargeback', text: `Chargeback of ${dispute.amount ?? 0} paise on payment ${dispute.payment_id ?? '?'}. Answer it in the Razorpay dashboard${dispute.respond_by ? ` by ${new Date(dispute.respond_by * 1000).toISOString().slice(0, 10)}` : ''} with the order record.`, uid: null, status: 'open', createdAt: now });
        logger.error('Chargeback opened', { disputeId: dispute.id, paymentId: dispute.payment_id ?? null, amountPaise: dispute.amount ?? 0 });
      }
      await setPaymentEventOutcome(eventId, 'dispute');
      res.status(200).json({ ok: true });
      return;
    }

    const payment = event.payload?.payment?.entity;
    if (event.event !== 'payment.captured' && event.event !== 'order.paid' && event.event !== 'payment.failed') {
      res.status(200).json({ ok: true, ignored: true }); // other events are acknowledged so Razorpay stops retrying
      return;
    }
    if (!payment?.order_id) {
      // Nothing we can settle, and an error answer would make Razorpay retry for a day and then switch the webhook off.
      logger.error('Webhook payment without an order id', { rzpPaymentId: payment?.id ?? null });
      res.status(200).json({ ok: true, ignored: true });
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
      // Never fulfilled; acknowledged so Razorpay does not retry it for a day. Handle by hand from the dashboard.
      logger.error('Non-INR payment', { orderId: orderDoc.id, rzpPaymentId: payment.id ?? null });
      await setPaymentEventOutcome(eventId, 'non-inr');
      res.status(200).json({ ok: true, ignored: true });
      return;
    }
    // Fulfils the order, or refunds the payment in full when the order can no longer be fulfilled
    // (it expired before the money arrived, or the amount is not the order total).
    const outcome = await settleCapture(orderDoc.id, { amountPaise: payment.amount ?? 0, rzpPaymentId: payment.id ?? null, method: payment.method ?? null });
    await setPaymentEventOutcome(eventId, outcome);
    res.status(200).json({ ok: true, outcome });
  } catch (err) {
    await setPaymentEventOutcome(eventId, 'error');
    logger.error('Webhook handling failed', { err: (err as Error).message });
    res.status(500).send('Retry later');
  }
});
