import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { z } from 'zod';
import type { Order } from '@foodcourt/shared';
import { RAZORPAY_KEY_SECRET, RAZORPAY_SECRETS, REGION, APP_CHECK_ENFORCE } from '../config';
import { db } from '../db';
import { clientIp, limitLocal, requireUid } from '../lib/guard';
import { materializePaidOrder } from '../lib/orders';
import { getPayment, verifyPaymentSignature } from '../lib/razorpay';

const VerifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
});

/**
 * Fast path after the checkout window reports success. The signature proves Razorpay issued this
 * payment for this order, but we still read the payment back from Razorpay and compare amount and
 * status before settling: the browser's word is never enough. The webhook reaches the same result
 * independently, and settling is idempotent, so whichever arrives second is a no-op.
 */
export const verifyPayment = onCall({ region: REGION, enforceAppCheck: APP_CHECK_ENFORCE, secrets: RAZORPAY_SECRETS, maxInstances: 100, concurrency: 80, timeoutSeconds: 30 }, async (req) => {
  const uid = requireUid(req);
  limitLocal(`ip:${clientIp(req)}:verify`, 600, 60);
  const parsed = VerifyPaymentSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Missing payment details.');
  const { razorpay_order_id: rzpOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = parsed.data;

  if (!verifyPaymentSignature(rzpOrderId, paymentId, signature, RAZORPAY_KEY_SECRET.value())) {
    logger.warn('Payment signature mismatch', { rzpOrderId });
    throw new HttpsError('invalid-argument', 'Payment could not be verified.');
  }

  const match = await db.collection('orders').where('payment.rzpOrderId', '==', rzpOrderId).limit(1).get();
  const doc = match.docs[0];
  const order = doc?.data() as Order | undefined;
  if (!doc || !order || order.uid !== uid) throw new HttpsError('not-found', 'Order not found.');

  let payment;
  try {
    payment = await getPayment(paymentId);
  } catch (err) {
    // Can't confirm right now: leave it to the webhook / reconcile sweep, which settle the same way.
    logger.warn('Could not read payment back', { rzpOrderId, err: (err as Error).message });
    return { verified: true, settled: false };
  }
  if (payment.order_id !== rzpOrderId) throw new HttpsError('invalid-argument', 'Payment could not be verified.');
  if (payment.status !== 'captured') return { verified: true, settled: false }; // e.g. still authorized; the webhook finishes it

  const outcome = await materializePaidOrder(doc.id, { amountPaise: payment.amount, rzpPaymentId: payment.id, method: payment.method ?? null });
  if (outcome === 'amount-mismatch') {
    await doc.ref.update({ 'payment.status': 'FLAGGED', updatedAt: Date.now() });
    throw new HttpsError('failed-precondition', 'Payment amount did not match the order. Please contact the counter.');
  }
  return { verified: true, settled: outcome === 'created' || outcome === 'already' };
});
