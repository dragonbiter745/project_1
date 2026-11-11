import * as crypto from 'crypto';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';
import { REFUNDABLE_STATUSES, type Order, type SubOrder } from '@foodcourt/shared';
import { db } from '../db';
import { createRefund, getRefund, RazorpayError } from './razorpay';

// Refunds follow one rule: the debt is written in the same transaction that fails the ticket
// (refund.status = REQUIRED), and after that anyone may pay it (the trigger, the sweeper, a manager's
// retry) but a transaction lets exactly one of them claim it. Nothing depends on a single run of a
// single function, so a lost trigger loses no money.

type Refund = NonNullable<SubOrder['refund']>;

/** Written with the status change that fails a ticket. Counter orders took no online money. */
export function refundOwed(paymentMode: SubOrder['paymentMode'], now: number): Refund {
  return paymentMode === 'COUNTER' ? { status: 'NOT_REQUIRED', amountPaise: 0, updatedAt: now } : { status: 'REQUIRED', amountPaise: 0, updatedAt: now };
}

/** Razorpay receipts are at most 40 characters; a long ticket id is hashed so two shops can never share one. */
export function refundIdFor(subOrderId: string, attempt = 0): string {
  const plain = `rf_${subOrderId}`;
  if (attempt === 0 && plain.length <= 40) return plain;
  const hash = crypto.createHash('sha256').update(subOrderId).digest('hex');
  return attempt === 0 ? `rf_${hash.slice(0, 37)}` : `rr${attempt}_${hash.slice(0, 34)}`;
}

/** Refunds that already hold part of the captured money, whatever Razorpay finally says about them. */
const CLAIMED = new Set(['PENDING', 'PROCESSED', 'FAILED']);

export type Claim =
  | { state: 'skipped' | 'not-required' }
  | { state: 'claimed' | 'existing'; refund: Refund; paymentId: string | null; token: string; ticketStatus: string };

/**
 * Turns a failed ticket's debt into a refund of a fixed amount, exactly once. The whole order is read in
 * the transaction, so the refunds of one order can never add up to more than was captured: shares are
 * rounded down and the last ticket to fail takes exactly what is left.
 */
export async function claimRefund(subOrderId: string): Promise<Claim> {
  const ref = db.collection('subOrders').doc(subOrderId);
  return db.runTransaction(async (tx): Promise<Claim> => {
    const t = (await tx.get(ref)).data() as SubOrder | undefined;
    if (!t || !REFUNDABLE_STATUSES.has(t.status)) return { state: 'skipped' };
    if (t.refund?.status === 'NOT_REQUIRED') return { state: 'not-required' };
    const order = (await tx.get(db.collection('orders').doc(t.orderId))).data() as Order | undefined;
    const paymentId = order?.payment.rzpPaymentId ?? null;
    if (t.refund && t.refund.status !== 'REQUIRED') return { state: 'existing', refund: t.refund, paymentId, token: t.token, ticketStatus: t.status };
    const now = Date.now();
    const paidOnline = order?.payment.mode === 'ONLINE' && order.payment.status === 'SUCCESS' && !!paymentId;
    if (!order || !paidOnline) {
      tx.update(ref, { refund: { status: 'NOT_REQUIRED', amountPaise: 0, updatedAt: now } });
      return { state: 'not-required' };
    }
    const siblings = await tx.get(db.collection('subOrders').where('orderId', '==', t.orderId));
    const others = siblings.docs.filter((d) => d.id !== subOrderId).map((d) => d.data() as SubOrder);
    const claimed = others.reduce((n, s) => n + (s.refund && CLAIMED.has(s.refund.status) ? s.refund.amountPaise : 0), 0);
    const { subtotalPaise, totalPaise } = order.totals;
    const left = Math.max(0, totalPaise - claimed);
    const othersSettled = others.every((s) => REFUNDABLE_STATUSES.has(s.status) && !!s.refund && s.refund.status !== 'REQUIRED');
    const share = subtotalPaise > 0 ? Math.floor((totalPaise * t.subtotalPaise) / subtotalPaise) : 0;
    const amountPaise = othersSettled ? left : Math.min(share, left);
    if (amountPaise <= 0) {
      tx.update(ref, { refund: { status: 'NOT_REQUIRED', amountPaise: 0, updatedAt: now } });
      return { state: 'not-required' };
    }
    const refund: Refund = { status: 'PENDING', amountPaise, refundId: refundIdFor(subOrderId), updatedAt: now };
    tx.update(ref, { refund });
    return { state: 'claimed', refund, paymentId, token: t.token, ticketStatus: t.status };
  });
}

/**
 * Records what Razorpay says about a refund. A refund that is PROCESSED stays PROCESSED: a late or
 * replayed notification can never move it back. A failure opens an issue for the manager and logs at
 * ERROR (an alert watches for it), so a failed refund is never silent.
 */
export async function settleRefund(subOrderId: string, status: 'PENDING' | 'PROCESSED' | 'FAILED', gatewayRefundId?: string, failReason?: string): Promise<boolean> {
  const ref = db.collection('subOrders').doc(subOrderId);
  const now = Date.now();
  const changed = await db.runTransaction(async (tx) => {
    const t = (await tx.get(ref)).data() as SubOrder | undefined;
    const r = t?.refund;
    if (!t || !r || r.status === 'PROCESSED' || r.status === 'NOT_REQUIRED' || r.status === 'REQUIRED') return null;
    const updates: Record<string, unknown> = { 'refund.updatedAt': now };
    if (gatewayRefundId) updates['refund.gatewayRefundId'] = gatewayRefundId;
    if (r.status !== status) updates['refund.status'] = status;
    if (status === 'FAILED' && failReason) updates['refund.failReason'] = failReason.slice(0, 200);
    tx.update(ref, updates);
    const newlyFailed = status === 'FAILED' && r.status !== 'FAILED';
    if (newlyFailed) {
      tx.set(db.collection('issues').doc(`refund_${subOrderId}`), {
        orderId: t.orderId,
        subOrderId,
        vendorId: t.vendorId,
        reason: 'refund_failed',
        text: `Refund of ${r.amountPaise} paise for ${t.token} failed${failReason ? `: ${failReason.slice(0, 200)}` : ''}. Retry it from Finance, or pay the diner directly and note it.`,
        uid: t.uid ?? null,
        status: 'open',
        createdAt: now,
      });
    }
    return { newlyFailed, changed: r.status !== status, t, r };
  });
  if (changed?.newlyFailed) logger.error('Refund failed', { subOrderId, orderId: changed.t.orderId, amountPaise: changed.r.amountPaise, failReason: failReason ?? null });
  return Boolean(changed?.changed);
}

/** Razorpay refused the request itself (not a timeout or an outage): asking again will not help. */
const permanent = (err: unknown) => err instanceof RazorpayError && err.status >= 400 && err.status < 500 && err.status !== 429 && err.status !== 408;

/** Sends a claimed refund to Razorpay. Safe to repeat: Razorpay answers a repeated refund id with the original refund. */
async function sendRefund(subOrderId: string, claim: Extract<Claim, { refund: Refund }>): Promise<void> {
  const { refund, paymentId } = claim;
  if (!paymentId || !refund.refundId) return;
  try {
    const r = await createRefund(paymentId, refund.refundId, refund.amountPaise, `${claim.token} ${claim.ticketStatus.toLowerCase()}`);
    await settleRefund(subOrderId, r.status === 'processed' ? 'PROCESSED' : r.status === 'failed' ? 'FAILED' : 'PENDING', r.id);
  } catch (err) {
    const message = (err as Error).message;
    if (permanent(err)) {
      await settleRefund(subOrderId, 'FAILED', undefined, message);
      return;
    }
    // Stays PENDING with its refund id; the sweeper sends it again every minute until Razorpay answers.
    logger.error('Refund request failed', { subOrderId, err: message });
  }
}

/** Claims and sends whatever this ticket owes. Called by the trigger, the sweeper and the manager's retry. */
export async function processRefund(subOrderId: string): Promise<Claim['state']> {
  const claim = await claimRefund(subOrderId);
  if (claim.state === 'claimed' || (claim.state === 'existing' && claim.refund.status === 'PENDING' && !claim.refund.gatewayRefundId)) {
    await sendRefund(subOrderId, claim);
  }
  return claim.state;
}

async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

/**
 * The safety net behind the trigger: sends every refund still owed, re-sends any whose request never got an
 * answer, and polls the ones Razorpay has not finished. Ten at a time, each on its own, so one bad ticket
 * or a slow gateway never holds up the rest.
 */
export async function sweepRefunds(): Promise<{ sent: number; settled: number }> {
  let sent = 0;
  let settled = 0;
  const [owed, pending] = await Promise.all([
    db.collection('subOrders').where('refund.status', '==', 'REQUIRED').limit(300).get(),
    db.collection('subOrders').where('refund.status', '==', 'PENDING').limit(300).get(),
  ]);
  await inBatches(owed.docs, 10, async (doc) => {
    try {
      const state = await processRefund(doc.id);
      if (state === 'claimed') sent++;
    } catch (err) {
      logger.error('Refund not sent', { subOrderId: doc.id, err: (err as Error).message });
    }
  });
  await inBatches(pending.docs, 10, async (doc) => {
    const t = doc.data() as SubOrder;
    try {
      if (!t.refund?.gatewayRefundId) {
        await processRefund(doc.id);
        return;
      }
      const r = await getRefund(t.refund.gatewayRefundId);
      if (r.status === 'pending') return;
      if (await settleRefund(doc.id, r.status === 'processed' ? 'PROCESSED' : 'FAILED', r.id)) settled++;
    } catch (err) {
      logger.warn('Refund status check failed', { subOrderId: doc.id, err: (err as Error).message });
    }
  });
  return { sent, settled };
}

/**
 * The manager sends a failed refund again. If Razorpay in fact finished the first one it is marked
 * processed instead, so a retry can never pay twice. A new attempt gets a new refund id, because Razorpay
 * answers a repeated id with the original (failed) refund.
 */
export async function retryRefund(subOrderId: string): Promise<'retried' | 'already-processed'> {
  const ref = db.collection('subOrders').doc(subOrderId);
  const current = (await ref.get()).data() as SubOrder | undefined;
  if (!current?.refund || current.refund.status !== 'FAILED') throw new Error('not-failed');
  if (current.refund.gatewayRefundId) {
    const r = await getRefund(current.refund.gatewayRefundId).catch(() => null);
    if (r?.status === 'processed') {
      await ref.update({ 'refund.status': 'PROCESSED', 'refund.updatedAt': Date.now() });
      await db.collection('issues').doc(`refund_${subOrderId}`).set({ status: 'resolved', resolvedAt: Date.now() }, { merge: true });
      return 'already-processed';
    }
  }
  await db.runTransaction(async (tx) => {
    const t = (await tx.get(ref)).data() as SubOrder | undefined;
    if (!t?.refund || t.refund.status !== 'FAILED') throw new Error('not-failed');
    const attempt = (t.refund.attempt ?? 0) + 1;
    tx.update(ref, {
      'refund.status': 'PENDING',
      'refund.refundId': refundIdFor(subOrderId, attempt),
      'refund.attempt': attempt,
      'refund.gatewayRefundId': FieldValue.delete(),
      'refund.failReason': FieldValue.delete(),
      'refund.updatedAt': Date.now(),
    });
    tx.set(db.collection('issues').doc(`refund_${subOrderId}`), { status: 'resolved', resolvedAt: Date.now() }, { merge: true });
  });
  await processRefund(subOrderId);
  return 'retried';
}
