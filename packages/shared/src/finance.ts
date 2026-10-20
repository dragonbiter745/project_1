// Court finance: what each shop earned, what the court keeps, and what it still owes the shop.
// All money is integer paise.

export const MAX_COMMISSION_PCT = 50;
export const MAX_PER_ORDER_FEE_PAISE = 10_000;

/** Court commission on one ticket, fixed when the ticket is created so later rate changes never rewrite history. */
export function commissionFor(subtotalPaise: number, vendor: { feePct?: number | null; perOrderFeePaise?: number | null }): number {
  const bps = Math.round(Math.min(MAX_COMMISSION_PCT, Math.max(0, vendor.feePct ?? 0)) * 100);
  const flat = Math.min(MAX_PER_ORDER_FEE_PAISE, Math.max(0, Math.round(vendor.perOrderFeePaise ?? 0)));
  return Math.min(subtotalPaise, Math.round((subtotalPaise * bps) / 10_000) + flat);
}

/** Midnight IST of a YYYY-MM-DD day, in epoch ms. */
export const istDayStartMs = (dateKey: string) => Date.parse(`${dateKey}T00:00:00+05:30`);

/** Shifts a YYYY-MM-DD day by n days without touching time zones. */
export function addDays(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Days in an inclusive YYYY-MM-DD range (1 for a single day). */
export const daysInRange = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/** The period of the same length that ends the day before `from`, for "vs previous period". */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const n = daysInRange(from, to);
  return { from: addDays(from, -n), to: addDays(from, -1) };
}

/** One day is shown by the hour, up to two months by the day, anything longer by the week. */
export type Granularity = 'hour' | 'day' | 'week';
export const granularityFor = (from: string, to: string): Granularity => {
  const n = daysInRange(from, to);
  return n <= 1 ? 'hour' : n <= 62 ? 'day' : 'week';
};

export interface Payout {
  id: string;
  vendorId: string;
  vendorName: string;
  amountPaise: number;
  /** Day the money was sent, YYYY-MM-DD (IST). */
  paidOn: string;
  /** Bank UTR or UPI reference. */
  reference: string;
  note?: string;
  status: 'RECORDED' | 'VOID';
  createdAt: number;
  createdBy: string;
  voidedAt?: number;
  voidedBy?: string;
  voidReason?: string;
}

export interface ShopFinance {
  vendorId: string;
  name: string;
  code: string;
  feePct: number;
  perOrderFeePaise: number;
  /** Online tickets that were not rejected, cancelled or timed out. */
  orders: number;
  /** Food sold online, after taking out failed tickets. */
  salesPaise: number;
  /** Returned to diners for this shop's failed tickets. */
  refundsPaise: number;
  commissionPaise: number;
  /** salesPaise minus commission: what the court owes the shop for the period. */
  payablePaise: number;
  /** Paid at the shop counter; the shop already holds this money. */
  counterOrders: number;
  counterSalesPaise: number;
  /** Payouts recorded with a paid-on date inside the period. */
  paidOutPaise: number;
  /** Everything ever owed minus everything ever paid out. Positive means the court still owes the shop. */
  balanceDuePaise: number;
  /** Same figures for the previous period of equal length, for comparison. */
  previousSalesPaise?: number;
  previousPayablePaise?: number;
  previousOrders?: number;
}

/** Money for any window: one shop's, or the whole court's. */
export interface PeriodTotals {
  /** Online tickets that were not rejected, cancelled or timed out. */
  orders: number;
  salesPaise: number;
  refundsPaise: number;
  /** Court commission on online and counter tickets. */
  commissionPaise: number;
  /** What the shop(s) earned: online sales minus all commission. */
  payablePaise: number;
  counterSalesPaise: number;
}

/** One bar on a trend chart. `key` is a YYYY-MM-DD day, or `YYYY-MM-DDTHH` for an IST hour. */
export interface SeriesPoint extends PeriodTotals {
  key: string;
}

export interface ShopReport extends ShopFinance {
  from: string;
  to: string;
  generatedAt: number;
  granularity: Granularity;
  series: SeriesPoint[];
  previous: PeriodTotals & { from: string; to: string };
}

export interface FinanceReport {
  from: string;
  to: string;
  generatedAt: number;
  /** Online payments received for the period (diner totals, GST and fees included). */
  collectedPaise: number;
  paidOrders: number;
  refundsPaise: number;
  netPaise: number;
  /** Coupon discounts the court paid for (shops still get full price); comes off court income. */
  couponsPaise: number;
  averageOrderPaise: number;
  counterOrders: number;
  counterSalesPaise: number;
  commissionPaise: number;
  payablePaise: number;
  paidOutPaise: number;
  balanceDuePaise: number;
  shops: ShopFinance[];
  granularity: Granularity;
  series: SeriesPoint[];
  previous: PeriodTotals & { from: string; to: string; collectedPaise: number; paidOrders: number; couponsPaise: number };
}
