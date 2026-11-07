import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from '../db';

/**
 * Append-only record of every verified gateway notification, one document per Razorpay event id
 * (`x-razorpay-event-id`, the same on every redelivery and replay). It holds only what is needed to prove
 * or rebuild a payment: no names, phone numbers or card data. If the orders were ever lost or corrupted,
 * these documents plus Razorpay's dashboard are enough to re-settle every payment.
 */
export interface LedgerEntry {
  eventId: string;
  event: string;
  rzpOrderId: string | null;
  rzpPaymentId: string | null;
  amountPaise: number | null;
  currency: string | null;
  method: string | null;
}

/** Never throws: losing the ledger write must not stop a real payment from being settled. */
export async function recordPaymentEvent(entry: LedgerEntry): Promise<void> {
  const ref = db.collection('paymentEvents').doc(entry.eventId);
  try {
    await ref.create({ ...entry, receivedAt: Date.now(), deliveries: 1, outcome: 'received' });
  } catch (err) {
    if ((err as { code?: number }).code === 6) {
      // Razorpay redelivered it (retries are at-least-once): count it, keep the original untouched.
      await ref.update({ deliveries: FieldValue.increment(1), lastSeenAt: Date.now() }).catch(() => undefined);
      return;
    }
    logger.error('Could not write the payment ledger', { eventId: entry.eventId, err: (err as Error).message });
  }
}

export async function setPaymentEventOutcome(eventId: string, outcome: string): Promise<void> {
  await db.collection('paymentEvents').doc(eventId).update({ outcome, settledAt: Date.now() }).catch(() => undefined);
}
