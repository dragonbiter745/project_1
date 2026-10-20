import { collection, doc, getDoc, getDocs, limit, orderBy, query, startAfter, where, type QueryConstraint, type QueryDocumentSnapshot } from 'firebase/firestore';
import {
  DEFAULT_PARTNERS,
  istDayStartMs,
  type FinanceReport,
  type FounderEntry,
  type FounderIncome,
  type Order,
  type OrderStatus,
  type Partner,
  type Payout,
  type ShopReport,
  type SubOrder,
} from '@foodcourt/shared';
import { getDb } from './db';
import { getFunctionsClient, httpsCallable } from './functions';
import { ActionError } from './ops';

// Finance data. Court totals (master) come from financeReport, one shop's from shopReport; both use
// aggregation queries. Lists page through Firestore directly, scoped by the rules to who may see them.

export type LedgerOrder = Order & { customerPhone?: string; displayName?: string };
export type LedgerFilter = 'all' | 'paid' | 'pending' | 'failed' | 'refunded';

const FILTER_STATUSES: Record<Exclude<LedgerFilter, 'all'>, OrderStatus[]> = {
  paid: ['PAID', 'COMPLETED'],
  pending: ['PENDING_PAYMENT'],
  failed: ['FAILED', 'EXPIRED'],
  refunded: ['PARTIALLY_REFUNDED'],
};

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

const action = <T>(data: Record<string, unknown>) => guarded(async () => (await httpsCallable<unknown, T>(getFunctionsClient(), 'financeAction')(data)).data);

export const getFinanceReport = (from: string, to: string) =>
  guarded(async () => (await httpsCallable<unknown, FinanceReport>(getFunctionsClient(), 'financeReport')({ from, to })).data);

export interface PayoutInput {
  requestKey: string;
  vendorId: string;
  amountPaise: number;
  paidOn: string;
  reference: string;
  note?: string;
}

export const recordPayout = (input: PayoutInput) => action<{ payoutId: string; duplicate: boolean }>({ action: 'RECORD_PAYOUT', ...input });
export const voidPayout = (payoutId: string, reason: string) => action<{ payoutId: string }>({ action: 'VOID_PAYOUT', payoutId, reason });
export const setCommission = (vendorId: string, feePct: number, perOrderFeePaise: number) =>
  action<{ vendorId: string }>({ action: 'SET_COMMISSION', vendorId, feePct, perOrderFeePaise });

export interface LedgerPage {
  rows: LedgerOrder[];
  cursor: QueryDocumentSnapshot | null;
}

/** One page of orders placed between two IST days (inclusive), newest first. */
export function listOrders(from: string, to: string, filter: LedgerFilter, after: QueryDocumentSnapshot | null = null, size = 50): Promise<LedgerPage> {
  const constraints: QueryConstraint[] = [
    where('createdAt', '>=', istDayStartMs(from)),
    where('createdAt', '<', istDayStartMs(to) + 86_400_000),
    orderBy('createdAt', 'desc'),
    limit(size),
  ];
  if (filter !== 'all') constraints.unshift(where('status', 'in', FILTER_STATUSES[filter]));
  if (after) constraints.push(startAfter(after));
  return guarded(async () => {
    const snap = await getDocs(query(collection(getDb(), 'orders'), ...constraints));
    return { rows: snap.docs.map((d) => ({ ...(d.data() as LedgerOrder), id: d.id })), cursor: snap.size === size ? snap.docs[snap.size - 1]! : null };
  });
}

/** Every order in the range for a CSV, fetched in pages and capped so one export can't run away. */
export async function allOrders(from: string, to: string, filter: LedgerFilter, cap = 10_000): Promise<LedgerOrder[]> {
  const out: LedgerOrder[] = [];
  let cursor: QueryDocumentSnapshot | null = null;
  do {
    const page: LedgerPage = await listOrders(from, to, filter, cursor, 500);
    out.push(...page.rows);
    cursor = page.cursor;
  } while (cursor && out.length < cap);
  return out;
}

/** Finds orders by full order id or the diner's 10-digit mobile number. */
export function searchOrders(term: string): Promise<LedgerOrder[]> {
  const t = term.trim();
  const phone = t.replace(/\D/g, '').slice(-10);
  return guarded(async () => {
    if (/^[6-9]\d{9}$/.test(phone) && !/^o[0-9a-f]{24}$/.test(t)) {
      const snap = await getDocs(query(collection(getDb(), 'orders'), where('customerPhone', '==', phone), orderBy('createdAt', 'desc'), limit(50)));
      return snap.docs.map((d) => ({ ...(d.data() as LedgerOrder), id: d.id }));
    }
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(t)) return [];
    const snap = await getDoc(doc(getDb(), 'orders', t));
    return snap.exists() ? [{ ...(snap.data() as LedgerOrder), id: snap.id }] : [];
  });
}

export const orderTickets = (orderId: string) =>
  guarded(async () => {
    const snap = await getDocs(query(collection(getDb(), 'subOrders'), where('orderId', '==', orderId)));
    return snap.docs.map((d) => ({ ...(d.data() as SubOrder), id: d.id }));
  });

export const listPayouts = (max = 500) =>
  guarded(async () => {
    const snap = await getDocs(query(collection(getDb(), 'payouts'), orderBy('createdAt', 'desc'), limit(max)));
    return snap.docs.map((d) => ({ ...(d.data() as Payout), id: d.id }));
  });

// ─── One shop (its own finance login, or the master previewing a shop) ──────

export const getShopReport = (from: string, to: string, vendorId?: string) =>
  guarded(async () => (await httpsCallable<unknown, ShopReport>(getFunctionsClient(), 'shopReport')({ from, to, ...(vendorId ? { vendorId } : {}) })).data);

export interface TicketPage {
  rows: SubOrder[];
  cursor: QueryDocumentSnapshot | null;
}

/** One shop's tickets between two IST days (inclusive), newest first. */
export function listShopTickets(vendorId: string, from: string, to: string, after: QueryDocumentSnapshot | null = null, size = 50): Promise<TicketPage> {
  const constraints: QueryConstraint[] = [
    where('vendorId', '==', vendorId),
    where('dateKey', '>=', from),
    where('dateKey', '<=', to),
    orderBy('dateKey', 'desc'),
    orderBy('ts.placed', 'desc'),
    limit(size),
  ];
  if (after) constraints.push(startAfter(after));
  return guarded(async () => {
    const snap = await getDocs(query(collection(getDb(), 'subOrders'), ...constraints));
    return { rows: snap.docs.map((d) => ({ ...(d.data() as SubOrder), id: d.id })), cursor: snap.size === size ? snap.docs[snap.size - 1]! : null };
  });
}

export async function allShopTickets(vendorId: string, from: string, to: string, cap = 10_000): Promise<SubOrder[]> {
  const out: SubOrder[] = [];
  let cursor: QueryDocumentSnapshot | null = null;
  do {
    const page: TicketPage = await listShopTickets(vendorId, from, to, cursor, 500);
    out.push(...page.rows);
    cursor = page.cursor;
  } while (cursor && out.length < cap);
  return out;
}

export const listShopPayouts = (vendorId: string, max = 200) =>
  guarded(async () => {
    const snap = await getDocs(query(collection(getDb(), 'payouts'), where('vendorId', '==', vendorId), orderBy('createdAt', 'desc'), limit(max)));
    return snap.docs.map((d) => ({ ...(d.data() as Payout), id: d.id }));
  });

// ─── Founder books (master only) ─────────────────────────────────────────────

export type EntryInput = Pick<FounderEntry, 'kind' | 'amountPaise' | 'date' | 'partnerId' | 'category' | 'paidBy' | 'note' | 'reference'>;

export const getFounderIncome = () => guarded(async () => (await httpsCallable<unknown, FounderIncome>(getFunctionsClient(), 'founderReport')({})).data);

export const getPartners = () =>
  guarded(async () => ((await getDoc(doc(getDb(), 'founders', 'partners'))).data()?.partners as Partner[] | undefined) ?? DEFAULT_PARTNERS);

export const listFounderEntries = (max = 5000) =>
  guarded(async () => {
    const snap = await getDocs(query(collection(getDb(), 'founderLedger'), orderBy('date', 'desc'), limit(max)));
    return snap.docs.map((d) => ({ ...(d.data() as FounderEntry), id: d.id }));
  });

export const recordEntry = (requestKey: string, entry: EntryInput) => action<{ entryId: string; duplicate: boolean }>({ action: 'RECORD_ENTRY', requestKey, ...entry });
export const voidEntry = (entryId: string, reason: string) => action<{ entryId: string }>({ action: 'VOID_ENTRY', entryId, reason });
export const setPartners = (partners: Partner[]) => action<{ ok: true }>({ action: 'SET_PARTNERS', partners });
