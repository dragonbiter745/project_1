import { FieldValue, Timestamp, type DocumentReference, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { REFUNDABLE_STATUSES, commissionFor, deriveParentOrderStatus, formatVendorToken, type Order, type SubOrder, type Vendor } from '@foodcourt/shared';
import { db } from '../db';
import { releaseCouponUse, writeCouponUse } from './coupons';
import { writeCustomerOrder } from './customers';

/** One ticket per shop per order; the id is deterministic so retries never duplicate tickets. */
export const subOrderId = (orderId: string, vendorId: string) => `${orderId}__${vendorId}`;

export const vendorIdsOf = (order: Pick<Order, 'items'>) => [...new Set(order.items.map((i) => i.vendorId))];

interface TicketReads {
  counters: Map<string, DocumentSnapshot>;
  vendors: Map<string, DocumentSnapshot>;
  existing: Map<string, DocumentSnapshot>;
}

/** Every read the ticket writes need. Firestore transactions require all reads before any write. */
export async function readForTickets(tx: Transaction, orderId: string, order: Pick<Order, 'items' | 'dateKey'>, opts: { counters?: boolean } = {}): Promise<TicketReads> {
  const ids = vendorIdsOf(order).sort();
  const vendorRefs = ids.map((v) => db.collection('vendors').doc(v));
  const ticketRefs = ids.map((v) => db.collection('subOrders').doc(subOrderId(orderId, v)));
  // The shops' token counters are the only documents many orders fight over. Lock them one at a time,
  // always in shop-id order: two multi-shop orders can then never wait on each other (no deadlock).
  const counters: DocumentSnapshot[] = [];
  if (opts.counters !== false) for (const v of ids) counters.push(await tx.get(db.collection('counters').doc(`${order.dateKey}_${v}`)));
  // Shop profiles (name, token prefix, commission) are read outside the transaction: they barely change during
  // service, and a transactional read would lock them, making every shop's profile a second point of contention.
  const [vendorSnaps, ticketSnaps] = await Promise.all([db.getAll(...vendorRefs), Promise.all(ticketRefs.map((r) => tx.get(r)))]);
  return {
    counters: new Map(counters.map((c, i) => [ids[i]!, c])),
    vendors: new Map(ids.map((v, i) => [v, vendorSnaps[i]!])),
    existing: new Map(ids.map((v, i) => [v, ticketSnaps[i]!])),
  };
}

/** Writes the shop tickets for a paid (or counter) order. Call only after readForTickets in the same transaction. */
export function writeTickets(
  tx: Transaction,
  orderId: string,
  order: Pick<Order, 'items' | 'dateKey' | 'uid' | 'sessionId' | 'tableId' | 'tableLabel'> & { displayName?: string },
  reads: TicketReads,
  now: number,
  paymentMode: 'ONLINE' | 'COUNTER',
  reserved?: Map<string, string>
): void {
  for (const vendorId of vendorIdsOf(order)) {
    if (reads.existing.get(vendorId)?.exists) continue;
    const vendor = reads.vendors.get(vendorId)!.data() as Vendor | undefined;
    let token = reserved?.get(vendorId);
    if (!token) {
      const counter = reads.counters.get(vendorId)!;
      const seq = ((counter.data()?.count as number | undefined) ?? 0) + 1;
      tx.set(counter.ref, { count: seq, updatedAt: now }, { merge: true });
      token = formatVendorToken(vendor?.code ?? 'FC', seq);
    }
    const items = order.items.filter((i) => i.vendorId === vendorId);
    const subtotalPaise = items.reduce((n, i) => n + i.pricePaise * i.qty, 0);
    const ticket: Omit<SubOrder, 'id'> = {
      orderId,
      uid: order.uid,
      sessionId: order.sessionId,
      tableId: order.tableId,
      dateKey: order.dateKey,
      vendorId,
      vendorName: vendor?.name ?? '',
      token,
      tableLabel: order.tableLabel,
      customerDisplay: order.displayName ?? '',
      items: items.map((i) => ({ id: i.itemId, name: i.name, qty: i.qty, pricePaise: i.pricePaise, ...(i.note ? { note: i.note } : {}) })),
      subtotalPaise,
      paymentMode,
      commissionPaise: commissionFor(subtotalPaise, vendor ?? {}),
      status: 'NEW',
      ts: { placed: now },
    };
    tx.set(db.collection('subOrders').doc(subOrderId(orderId, vendorId)), ticket);
  }
}

/**
 * `late`: the order is no longer payable (it expired, failed or was cancelled before the money arrived), so it
 * must not reach a kitchen. The caller refunds the payment in full (lib/payments.ts).
 */
export type Materialized = 'created' | 'already' | 'missing' | 'amount-mismatch' | 'late';

/**
 * Retries a transaction that lost a lock race, with jitter. A burst of payments for one shop all take
 * that shop's token counter; without this, the losers fail and wait minutes for Razorpay to retry.
 */
export async function retryContention<T>(fn: () => Promise<T>, attempts = 8): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: number | string }).code;
      const msg = (err as { message?: string }).message ?? '';
      const contended =
        code === 10 ||
        code === 4 ||
        code === '10' ||
        code === '4' ||
        code === 'aborted' ||
        code === 'deadline-exceeded' ||
        msg.includes('ABORTED') ||
        msg.includes('Transaction lock timeout') ||
        msg.includes('Transaction is invalid or closed');
      if (!contended || i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 120 * i + Math.random() * 400));
    }
  }
}

const DONE = new Set(['PAID', 'COMPLETED', 'PARTIALLY_REFUNDED']);

/**
 * Takes this order's token at each of its shops, one tiny transaction per shop (that shop's counter and
 * this order's hold for it, nothing else). The hold keeps the token, so a retry or a duplicate webhook reuses it and
 * a number is never given out twice. Kept apart from the payment transaction so a burst of payments for one
 * shop queues only on this small step and never deadlocks.
 */
async function reserveTokens(orderId: string, order: Pick<Order, 'items' | 'dateKey'>): Promise<Map<string, string>> {
  const ids = vendorIdsOf(order).sort();
  const vendorSnaps = await db.getAll(...ids.map((v) => db.collection('vendors').doc(v)));
  const out = new Map<string, string>();
  for (const [i, vendorId] of ids.entries()) {
    const code = (vendorSnaps[i]!.data() as Vendor | undefined)?.code ?? 'FC';
    const counterRef = db.collection('counters').doc(`${order.dateKey}_${vendorId}`);
    const holdRef = db.collection('tokenHolds').doc(subOrderId(orderId, vendorId));
    const token = await retryContention(() =>
      db.runTransaction(async (tx) => {
        // Counter first, always: duplicates of this order queue here and then find their token already held.
        const counter = await tx.get(counterRef);
        const held = (await tx.get(holdRef)).data()?.token as string | undefined;
        if (held) return held;
        const seq = ((counter.data()?.count as number | undefined) ?? 0) + 1;
        const next = formatVendorToken(code, seq);
        const now = Date.now();
        tx.set(counterRef, { count: seq, updatedAt: now }, { merge: true });
        // TTL policy field: Firestore removes the hold two days later; the ticket keeps the token.
        tx.create(holdRef, { token: next, orderId, vendorId, at: now, expireAt: Timestamp.fromMillis(now + 2 * 86_400_000) });
        return next;
      })
    );
    out.set(vendorId, token);
  }
  return out;
}

/**
 * Marks an online order paid and creates its shop tickets, atomically and idempotently.
 * Safe to call from the webhook and the reconciler for the same payment.
 */
export async function materializePaidOrder(orderId: string, payment: { amountPaise: number; rzpPaymentId?: string | null; method?: string | null }): Promise<Materialized> {
  const orderRef = db.collection('orders').doc(orderId);
  const before = await orderRef.get();
  if (!before.exists) return 'missing';
  const first = before.data() as Order;
  if (DONE.has(first.status)) return 'already';
  if (first.status !== 'PENDING_PAYMENT') return 'late';
  if (payment.amountPaise !== first.totals.totalPaise) return 'amount-mismatch';
  const tokens = await reserveTokens(orderId, first);
  return retryContention(() => db.runTransaction(async (tx): Promise<Materialized> => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return 'missing';
    const order = snap.data() as Order & { displayName?: string };
    if (DONE.has(order.status)) return 'already';
    if (order.status !== 'PENDING_PAYMENT') return 'late';
    if (payment.amountPaise !== order.totals.totalPaise) return 'amount-mismatch';
    const reads = await readForTickets(tx, orderId, order, { counters: false });
    const now = Date.now();
    tx.update(orderRef, {
      status: 'PAID',
      'payment.status': 'SUCCESS',
      'payment.paidAt': now,
      'payment.rzpPaymentId': payment.rzpPaymentId ?? null,
      'payment.method': payment.method ?? 'UPI',
      updatedAt: now,
    });
    writeTickets(tx, orderId, order, reads, now, 'ONLINE', tokens);
    writeCustomerOrder(tx, order, now);
    writeCouponUse(tx, order, now);
    return 'created';
  }));
}

/** Recomputes an order's status from its tickets after any ticket changes. */
export async function syncParentStatus(orderId: string): Promise<void> {
  const orderRef = db.collection('orders').doc(orderId);
  const [tickets, parent] = await Promise.all([db.collection('subOrders').where('orderId', '==', orderId).get(), orderRef.get()]);
  if (tickets.empty) return;
  const all = tickets.docs.map((d) => d.data() as SubOrder);
  const status = deriveParentOrderStatus(all);
  // Most kitchen steps leave the order's overall status as it was: skip the write (and the listeners' re-reads).
  if (parent.data()?.status !== status) await orderRef.update({ status, updatedAt: Date.now() });
  // Nothing was eaten: hand the diner's coupon use back.
  if (all.every((t) => REFUNDABLE_STATUSES.has(t.status))) await releaseCouponUse(orderId);
}

/** A ticket's share of what the diner actually paid (GST and fees included), in paise. */
export function refundShare(order: Pick<Order, 'totals'>, ticketSubtotalPaise: number): number {
  const { subtotalPaise, totalPaise } = order.totals;
  if (subtotalPaise <= 0) return 0;
  return Math.min(totalPaise, Math.round((totalPaise * ticketSubtotalPaise) / subtotalPaise));
}

export const timelineKey: Record<string, string> = {
  ACCEPTED: 'accepted',
  PREPARING: 'preparing',
  READY: 'ready',
  COLLECTED: 'collected',
  REJECTED: 'rejected',
  TIMED_OUT: 'timedOut',
  CANCELLED: 'cancelled',
};

export const deleteField = () => FieldValue.delete();
export type { DocumentReference };
