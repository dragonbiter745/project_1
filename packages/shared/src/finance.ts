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
  averageOrderPaise: number;
  counterOrders: number;
  counterSalesPaise: number;
  commissionPaise: number;
  payablePaise: number;
  paidOutPaise: number;
  balanceDuePaise: number;
  shops: ShopFinance[];
}
