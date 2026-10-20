import type { OrderTotals } from './types';

// Coupons. The court pays every discount: shops are paid their full menu price and commission is
// worked out on it, so a coupon never changes a shop's figures. Coupons only apply to online
// payments (at the counter the shop holds the cash). Money is integer paise.

export type CouponScope =
  | { kind: 'ALL' }
  | { kind: 'VENDORS'; vendorIds: string[] }
  | { kind: 'CATEGORIES'; categories: Array<{ vendorId: string; categoryId: string }> };

export interface Coupon {
  code: string;
  title: string;
  description?: string;
  kind: 'PERCENT' | 'FLAT';
  /** PERCENT: basis points (1000 = 10%). */
  percentBps?: number;
  /** FLAT: amount off. */
  flatPaise?: number;
  /** Cap on a PERCENT discount. */
  maxDiscountPaise?: number | null;
  /** The eligible dishes must add up to at least this. */
  minOrderPaise: number;
  scope: CouponScope;
  /** MEMBERS: signed-in (Google) diners only. */
  audience: 'EVERYONE' | 'MEMBERS';
  firstOrderOnly: boolean;
  /** Listed in signed-in diners' "My coupons"; otherwise it only works by typing the code. */
  showInWallet: boolean;
  startsAt: number;
  endsAt: number | null;
  totalLimit: number | null;
  perCustomerLimit: number;
  active: boolean;
  usedCount: number;
  discountGivenPaise: number;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
}

/** What a diner's phone may know about a coupon: enough to show it and preview the saving. */
export type PublicCoupon = Pick<
  Coupon,
  'code' | 'title' | 'description' | 'kind' | 'percentBps' | 'flatPaise' | 'maxDiscountPaise' | 'minOrderPaise' | 'scope' | 'audience' | 'firstOrderOnly' | 'endsAt'
>;

export const toPublicCoupon = (c: Coupon): PublicCoupon => ({
  code: c.code,
  title: c.title,
  ...(c.description ? { description: c.description } : {}),
  kind: c.kind,
  ...(c.kind === 'PERCENT' ? { percentBps: c.percentBps, maxDiscountPaise: c.maxDiscountPaise ?? null } : { flatPaise: c.flatPaise }),
  minOrderPaise: c.minOrderPaise,
  scope: c.scope,
  audience: c.audience,
  firstOrderOnly: c.firstOrderOnly,
  endsAt: c.endsAt,
});

export const COUPON_CODE = /^[A-Z0-9][A-Z0-9-]{2,19}$/;
export const normaliseCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, '');

/** The smallest amount a payment can be; a coupon never takes the total below it. */
export const MIN_PAYABLE_PAISE = 100;

export interface CouponLine {
  vendorId: string;
  categoryId?: string;
  pricePaise: number;
  qty: number;
}

export interface CouponContext {
  now: number;
  member: boolean;
  /** Orders this diner has placed before (from their customer summary). */
  previousOrders: number;
  /** Times this diner has already used this coupon. */
  usedByDiner: number;
  /** The order total before the coupon, so the discount never takes it below MIN_PAYABLE_PAISE. */
  totalBeforePaise: number;
}

export type CouponResult = { ok: true; discountPaise: number; eligiblePaise: number } | { ok: false; reason: string };

type Evaluable = PublicCoupon & Partial<Pick<Coupon, 'active' | 'startsAt' | 'totalLimit' | 'usedCount' | 'perCustomerLimit'>>;

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function eligibleSubtotal(scope: CouponScope, lines: CouponLine[]): number {
  const matches = (l: CouponLine) =>
    scope.kind === 'ALL'
      ? true
      : scope.kind === 'VENDORS'
        ? scope.vendorIds.includes(l.vendorId)
        : scope.categories.some((c) => c.vendorId === l.vendorId && c.categoryId === l.categoryId);
  return lines.filter(matches).reduce((n, l) => n + l.pricePaise * l.qty, 0);
}

/** Why this diner cannot use the coupon right now, whatever is in their cart; null if they can. */
export function couponBlocked(c: Evaluable, ctx: Omit<CouponContext, 'totalBeforePaise'>): string | null {
  if (c.active === false) return 'This coupon is not active right now.';
  if (c.startsAt && ctx.now < c.startsAt) return 'This coupon has not started yet.';
  if (c.endsAt && ctx.now > c.endsAt) return 'This coupon has expired.';
  if (c.totalLimit != null && (c.usedCount ?? 0) >= c.totalLimit) return 'This coupon has been fully used.';
  if (c.audience === 'MEMBERS' && !ctx.member) return 'Sign in to use this coupon.';
  if (c.firstOrderOnly && ctx.previousOrders > 0) return 'This coupon is for your first order.';
  if (c.perCustomerLimit != null && ctx.usedByDiner >= c.perCustomerLimit) {
    return c.perCustomerLimit === 1 ? "You've already used this coupon." : `You've used this coupon ${c.perCustomerLimit} times already.`;
  }
  return null;
}

/** The discount a coupon gives on these dishes for this diner, or why it does not apply. */
export function evaluateCoupon(c: Evaluable, lines: CouponLine[], ctx: CouponContext): CouponResult {
  const blocked = couponBlocked(c, ctx);
  if (blocked) return { ok: false, reason: blocked };
  const eligiblePaise = eligibleSubtotal(c.scope, lines);
  if (eligiblePaise === 0) {
    return { ok: false, reason: c.scope.kind === 'VENDORS' ? 'This coupon is for dishes from other shops.' : 'This coupon is for other dishes on the menu.' };
  }
  if (eligiblePaise < c.minOrderPaise) return { ok: false, reason: `Add ${rupees(c.minOrderPaise - eligiblePaise)} more of eligible dishes to use this coupon.` };

  let discount = c.kind === 'PERCENT' ? Math.floor((eligiblePaise * (c.percentBps ?? 0)) / 10_000) : (c.flatPaise ?? 0);
  if (c.kind === 'PERCENT' && c.maxDiscountPaise) discount = Math.min(discount, c.maxDiscountPaise);
  discount = Math.min(discount, eligiblePaise, Math.max(0, ctx.totalBeforePaise - MIN_PAYABLE_PAISE));
  if (discount <= 0) return { ok: false, reason: 'This order is too small for this coupon.' };
  return { ok: true, discountPaise: discount, eligiblePaise };
}

/** The order totals after a coupon: the diner pays less; the item total (and each shop's share) is unchanged. */
export const withDiscount = (totals: OrderTotals, discountPaise: number): OrderTotals =>
  discountPaise > 0 ? { ...totals, discountPaise, totalPaise: totals.totalPaise - discountPaise } : totals;

/** "20% off, up to ₹50" / "₹30 off". */
export function couponHeadline(c: Pick<PublicCoupon, 'kind' | 'percentBps' | 'flatPaise' | 'maxDiscountPaise'>): string {
  if (c.kind === 'FLAT') return `${rupees(c.flatPaise ?? 0)} off`;
  const pct = `${(c.percentBps ?? 0) / 100}% off`;
  return c.maxDiscountPaise ? `${pct}, up to ${rupees(c.maxDiscountPaise)}` : pct;
}

/** What the cart gets back when a diner enters a code: the terms to preview the saving locally. */
export interface CouponPreview {
  coupon: PublicCoupon;
  context: Pick<CouponContext, 'member' | 'previousOrders' | 'usedByDiner'>;
  perCustomerLimit: number;
}
