// Customer analytics. The server keeps one summary per diner (customers/{uid}) and one record per
// diner per day they came (visits/{uid}_{dateKey}); the master console reads both. Money is paise.

export interface CustomerRecord {
  uid: string;
  /** Signed in with Google. Guests are counted per phone (their anonymous uid). */
  member: boolean;
  /** A member's own name. */
  name?: string | null;
  /** The name on their latest table session ("Zesty Mango" for guests). */
  displayName?: string;
  email?: string | null;
  phone?: string | null;
  photoURL?: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
  /** IST day of the latest visit, YYYY-MM-DD. */
  lastVisitKey: string;
  /** Distinct IST days with a table scan. */
  visits: number;
  /** Orders paid online or placed to pay at the counter (before refunds). */
  orders: number;
  spendPaise: number;
  lastOrderAt?: number;
  byVendor?: Record<string, { orders: number; spendPaise: number }>;
  /** Dishes ordered per menu category, keyed `${vendorId}__${categoryId}`. */
  byCategory?: Record<string, { qty: number }>;
  updatedAt: number;
}

export interface VisitRecord {
  uid: string;
  dateKey: string;
  /** Their first ever visit. */
  first: boolean;
  /** Placed at least one order that day. */
  ordered?: boolean;
  at: number;
}

export const categoryKey = (vendorId: string, categoryId: string) => `${vendorId}__${categoryId}`;

/** Regulars came on 3+ days and were here in the last 30 days; lapsed have not been back in 30 days. */
export const REGULAR_VISITS = 3;
export const LAPSED_DAYS = 30;

export type CustomerSegment = 'recent' | 'top' | 'frequent' | 'members' | 'new' | 'lapsed';

export type CustomerTag = 'new' | 'regular' | 'lapsed' | 'member';

export function customerTags(c: Pick<CustomerRecord, 'visits' | 'firstSeenAt' | 'lastSeenAt' | 'member'>, now = Date.now()): CustomerTag[] {
  const tags: CustomerTag[] = [];
  const day = 86_400_000;
  if (c.member) tags.push('member');
  if (now - c.lastSeenAt > LAPSED_DAYS * day) tags.push('lapsed');
  else if (c.visits >= REGULAR_VISITS) tags.push('regular');
  if (now - c.firstSeenAt <= 7 * day) tags.push('new');
  return tags;
}

/** Masks a mobile number for lists: 98•••••210. */
export const maskPhone = (phone?: string | null) => (phone && phone.length === 10 ? `${phone.slice(0, 2)}•••••${phone.slice(7)}` : '');

export interface CustomerInsights {
  days: number;
  generatedAt: number;
  totalCustomers: number;
  members: number;
  newInRange: number;
  activeInRange: number;
  lapsed: number;
  /** Customers who have ordered at least once, and at least twice. */
  ordered: number;
  repeat: number;
  totalOrders: number;
  totalSpendPaise: number;
  granularity: 'day' | 'week';
  /** Visitors per day (or week): first-timers, returning, and how many of them ordered. */
  series: Array<{ key: string; visitors: number; newVisitors: number; ordered: number }>;
}
