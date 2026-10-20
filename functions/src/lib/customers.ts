import { FieldValue, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { categoryKey, type CustomerRecord, type Order } from '@foodcourt/shared';
import { db } from '../db';

// Customer analytics, written inside the same transactions that open sessions and confirm orders,
// so the counts can never drift from what actually happened. Each diner has their own documents,
// so busy hours never contend on a shared counter.

export const customerRef = (uid: string) => db.collection('customers').doc(uid);
export const visitRef = (uid: string, dateKey: string) => db.collection('visits').doc(`${uid}_${dateKey}`);

/** Counts one visit per diner per IST day. Call after reading `snap` (customers/{uid}) in the same transaction. */
export function writeVisit(tx: Transaction, snap: DocumentSnapshot, v: { uid: string; dateKey: string; now: number; displayName: string; member: boolean }): boolean {
  const c = snap.data() as Partial<CustomerRecord> | undefined;
  if (c?.lastVisitKey === v.dateKey) return false;
  const first = !c?.firstSeenAt;
  tx.set(
    snap.ref,
    {
      uid: v.uid,
      member: v.member || c?.member === true,
      displayName: v.displayName,
      lastSeenAt: v.now,
      lastVisitKey: v.dateKey,
      visits: FieldValue.increment(1),
      updatedAt: v.now,
      ...(first ? { firstSeenAt: v.now } : {}),
      ...(c?.orders === undefined ? { orders: 0, spendPaise: 0 } : {}),
    },
    { merge: true }
  );
  // Merge: an order may already have marked this day as ordered.
  tx.set(visitRef(v.uid, v.dateKey), { uid: v.uid, dateKey: v.dateKey, first, at: v.now }, { merge: true });
  return true;
}

type ConfirmedOrder = Pick<Order, 'uid' | 'dateKey' | 'items' | 'totals'> & { customerPhone?: string };

/** Adds a confirmed order to the diner's summary. Writes only, so it fits after any transaction's reads. */
export function writeCustomerOrder(tx: Transaction, order: ConfirmedOrder, now: number): void {
  if (!order.uid) return;
  const vendorSpend = new Map<string, number>();
  const categoryQty = new Map<string, number>();
  for (const i of order.items) {
    vendorSpend.set(i.vendorId, (vendorSpend.get(i.vendorId) ?? 0) + i.pricePaise * i.qty);
    if (i.categoryId) {
      const key = categoryKey(i.vendorId, i.categoryId);
      categoryQty.set(key, (categoryQty.get(key) ?? 0) + i.qty);
    }
  }
  const byVendor = Object.fromEntries([...vendorSpend].map(([v, spend]) => [v, { orders: FieldValue.increment(1), spendPaise: FieldValue.increment(spend) }]));
  const byCategory = Object.fromEntries([...categoryQty].map(([k, qty]) => [k, { qty: FieldValue.increment(qty) }]));
  tx.set(
    customerRef(order.uid),
    {
      uid: order.uid,
      orders: FieldValue.increment(1),
      spendPaise: FieldValue.increment(order.totals.totalPaise),
      lastOrderAt: now,
      lastSeenAt: now,
      byVendor,
      byCategory,
      updatedAt: now,
      ...(order.customerPhone ? { phone: order.customerPhone } : {}),
    },
    { merge: true }
  );
  tx.set(visitRef(order.uid, order.dateKey), { uid: order.uid, dateKey: order.dateKey, ordered: true }, { merge: true });
}

type Counts = Partial<CustomerRecord>;

function sumMaps<T extends Record<string, number>>(a: Record<string, T> = {}, b: Record<string, T> = {}): Record<string, T> {
  const out: Record<string, T> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    out[k] = prev ? (Object.fromEntries(Object.keys({ ...prev, ...v }).map((f) => [f, (prev[f] ?? 0) + (v[f] ?? 0)])) as T) : v;
  }
  return out;
}

/** Folds a guest's summary into the account's when their orders move across (PRD §7.4). */
export function mergeCustomer(tx: Transaction, from: DocumentSnapshot, to: DocumentSnapshot, now: number): void {
  const g = from.data() as Counts | undefined;
  if (!g) return;
  const m = (to.data() ?? {}) as Counts;
  const lastVisitKey = [m.lastVisitKey ?? '', g.lastVisitKey ?? ''].sort().pop();
  const lastOrderAt = Math.max(m.lastOrderAt ?? 0, g.lastOrderAt ?? 0);
  tx.set(
    to.ref,
    {
      uid: to.id,
      visits: (m.visits ?? 0) + (g.visits ?? 0),
      orders: (m.orders ?? 0) + (g.orders ?? 0),
      spendPaise: (m.spendPaise ?? 0) + (g.spendPaise ?? 0),
      firstSeenAt: Math.min(m.firstSeenAt ?? now, g.firstSeenAt ?? now),
      lastSeenAt: Math.max(m.lastSeenAt ?? 0, g.lastSeenAt ?? 0),
      ...(lastVisitKey ? { lastVisitKey } : {}),
      ...(lastOrderAt ? { lastOrderAt } : {}),
      byVendor: sumMaps(m.byVendor, g.byVendor),
      byCategory: sumMaps(m.byCategory, g.byCategory),
      ...(m.phone || g.phone ? { phone: m.phone ?? g.phone } : {}),
      updatedAt: now,
    },
    { merge: true }
  );
  tx.delete(from.ref);
}
