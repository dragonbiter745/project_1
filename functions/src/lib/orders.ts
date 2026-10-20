import { FieldValue, type DocumentReference, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { commissionFor, deriveParentOrderStatus, formatVendorToken, type Order, type SubOrder, type Vendor } from '@foodcourt/shared';
import { db } from '../db';
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
export async function readForTickets(tx: Transaction, orderId: string, order: Pick<Order, 'items' | 'dateKey'>): Promise<TicketReads> {
  const ids = vendorIdsOf(order);
  const counterRefs = ids.map((v) => db.collection('counters').doc(`${order.dateKey}_${v}`));
  const vendorRefs = ids.map((v) => db.collection('vendors').doc(v));
  const ticketRefs = ids.map((v) => db.collection('subOrders').doc(subOrderId(orderId, v)));
  const snaps = await Promise.all([...counterRefs, ...vendorRefs, ...ticketRefs].map((r) => tx.get(r)));
  const n = ids.length;
  return {
    counters: new Map(ids.map((v, i) => [v, snaps[i]!])),
    vendors: new Map(ids.map((v, i) => [v, snaps[n + i]!])),
    existing: new Map(ids.map((v, i) => [v, snaps[2 * n + i]!])),
  };
}

/** Writes the shop tickets for a paid (or counter) order. Call only after readForTickets in the same transaction. */
export function writeTickets(
  tx: Transaction,
  orderId: string,
  order: Pick<Order, 'items' | 'dateKey' | 'uid' | 'sessionId' | 'tableId' | 'tableLabel'> & { displayName?: string },
  reads: TicketReads,
  now: number,
  paymentMode: 'ONLINE' | 'COUNTER'
): void {
  for (const vendorId of vendorIdsOf(order)) {
    if (reads.existing.get(vendorId)?.exists) continue;
    const counter = reads.counters.get(vendorId)!;
    const vendor = reads.vendors.get(vendorId)!.data() as Vendor | undefined;
    const seq = ((counter.data()?.count as number | undefined) ?? 0) + 1;
    tx.set(counter.ref, { count: seq, updatedAt: now }, { merge: true });
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
      token: formatVendorToken(vendor?.code ?? 'FC', seq),
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

export type Materialized = 'created' | 'already' | 'missing' | 'amount-mismatch';

/**
 * Marks an online order paid and creates its shop tickets, atomically and idempotently.
 * Safe to call from the webhook and the reconciler for the same payment.
 */
export async function materializePaidOrder(orderId: string, payment: { amountPaise: number; cfPaymentId?: string | null; method?: string | null }): Promise<Materialized> {
  const orderRef = db.collection('orders').doc(orderId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return 'missing';
    const order = snap.data() as Order & { displayName?: string };
    if (order.status === 'PAID' || order.status === 'COMPLETED' || order.status === 'PARTIALLY_REFUNDED') return 'already';
    if (payment.amountPaise !== order.totals.totalPaise) return 'amount-mismatch';
    const reads = await readForTickets(tx, orderId, order);
    const now = Date.now();
    tx.update(orderRef, {
      status: 'PAID',
      'payment.status': 'SUCCESS',
      'payment.paidAt': now,
      'payment.cfPaymentId': payment.cfPaymentId ?? null,
      'payment.method': payment.method ?? 'UPI',
      updatedAt: now,
    });
    writeTickets(tx, orderId, order, reads, now, 'ONLINE');
    writeCustomerOrder(tx, order, now);
    return 'created';
  });
}

/** Recomputes an order's status from its tickets after any ticket changes. */
export async function syncParentStatus(orderId: string): Promise<void> {
  const tickets = await db.collection('subOrders').where('orderId', '==', orderId).get();
  if (tickets.empty) return;
  const status = deriveParentOrderStatus(tickets.docs.map((d) => d.data() as SubOrder));
  await db.collection('orders').doc(orderId).update({ status, updatedAt: Date.now() });
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
