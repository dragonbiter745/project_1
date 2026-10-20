import { collection, doc, getDoc, getDocs, limit, orderBy, query, startAfter, where, type QueryConstraint, type QueryDocumentSnapshot } from 'firebase/firestore';
import { LAPSED_DAYS, type CustomerInsights, type CustomerRecord, type CustomerSegment, type Order } from '@foodcourt/shared';
import { getDb } from './db';
import { getFunctionsClient, httpsCallable } from './functions';
import { ActionError } from './ops';

// Customer analytics for the master console. Totals come from customerInsights (aggregation
// queries); lists page through customers/ 50 at a time, never a whole-collection listener.

const PAGE = 50;
const DAY = 86_400_000;

export interface CustomerPage {
  rows: CustomerRecord[];
  cursor: QueryDocumentSnapshot | null;
}

function message(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e?.code === 'functions/unavailable' || (typeof navigator !== 'undefined' && !navigator.onLine)) return 'No connection. Check the network and try again.';
  return e?.message?.replace(/^Firebase: /, '') || 'Something went wrong. Try again.';
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new ActionError(message(err));
  }
}

export const getCustomerInsights = (days: 7 | 30 | 90) =>
  guarded(async () => (await httpsCallable<unknown, CustomerInsights>(getFunctionsClient(), 'customerInsights')({ days })).data);

function segmentQuery(segment: CustomerSegment, now: number): QueryConstraint[] {
  switch (segment) {
    case 'top':
      return [orderBy('spendPaise', 'desc')];
    case 'frequent':
      return [orderBy('visits', 'desc')];
    case 'members':
      return [where('member', '==', true), orderBy('lastSeenAt', 'desc')];
    case 'new':
      return [where('firstSeenAt', '>=', now - 7 * DAY), orderBy('firstSeenAt', 'desc')];
    case 'lapsed':
      return [where('lastSeenAt', '<', now - LAPSED_DAYS * DAY), orderBy('lastSeenAt', 'desc')];
    default:
      return [orderBy('lastSeenAt', 'desc')];
  }
}

const rowsOf = (docs: QueryDocumentSnapshot[]) => docs.map((d) => ({ ...(d.data() as CustomerRecord), uid: d.id }));

export const listCustomers = (segment: CustomerSegment, cursor: QueryDocumentSnapshot | null = null) =>
  guarded(async (): Promise<CustomerPage> => {
    const q = query(collection(getDb(), 'customers'), ...segmentQuery(segment, Date.now()), ...(cursor ? [startAfter(cursor)] : []), limit(PAGE));
    const snap = await getDocs(q);
    return { rows: rowsOf(snap.docs), cursor: snap.size === PAGE ? snap.docs[snap.docs.length - 1]! : null };
  });

/** Exact match on a 10-digit mobile number or an email address. */
export const findCustomers = (text: string) =>
  guarded(async (): Promise<CustomerRecord[]> => {
    const t = text.trim();
    const byEmail = t.includes('@');
    const value = byEmail ? t : t.replace(/\D/g, '').slice(-10);
    if (!byEmail && value.length !== 10) return [];
    const snap = await getDocs(query(collection(getDb(), 'customers'), where(byEmail ? 'email' : 'phone', '==', value), limit(20)));
    return rowsOf(snap.docs);
  });

export const getCustomer = (uid: string) =>
  guarded(async () => {
    const snap = await getDoc(doc(getDb(), 'customers', uid));
    return snap.exists() ? ({ ...(snap.data() as CustomerRecord), uid } as CustomerRecord) : null;
  });

export const customerOrders = (uid: string) =>
  guarded(async () => {
    const snap = await getDocs(query(collection(getDb(), 'orders'), where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(25)));
    return snap.docs.map((d) => ({ ...(d.data() as Order), id: d.id }));
  });
