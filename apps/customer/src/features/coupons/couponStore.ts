import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  evaluateCoupon,
  type CartItem,
  type CouponLine,
  type CouponPreview,
  type CouponResult,
  type PublicCoupon,
} from '@foodcourt/shared';
import type { FoodCourtDataState } from '@foodcourt/firebase-client/state';
import { getCallable } from '../../lib/firebase';

// The coupon the diner applied to their cart. Only the terms live here, to preview the saving as
// the cart changes; the server works the discount out again from scratch at checkout.

interface CouponState {
  preview: CouponPreview | null;
  apply: (preview: CouponPreview) => void;
  clear: () => void;
}

export const useCoupon = create<CouponState>()(
  persist(
    (set) => ({
      preview: null,
      apply: (preview) => set({ preview }),
      clear: () => set({ preview: null }),
    }),
    { name: 'fc_coupon_v1', version: 1, partialize: (s) => ({ preview: s.preview }) }
  )
);

export interface WalletCoupon {
  coupon: PublicCoupon;
  usable: boolean;
  reason: string | null;
  usesLeft: number;
}

type DinerCouponsRequest = { action: 'PREVIEW'; code: string } | { action: 'WALLET' };

export async function previewCoupon(code: string): Promise<CouponPreview> {
  const fn = await getCallable<DinerCouponsRequest, CouponPreview>('dinerCoupons');
  return (await fn({ action: 'PREVIEW', code })).data;
}

export async function walletCoupons(): Promise<WalletCoupon[]> {
  const fn = await getCallable<DinerCouponsRequest, { coupons: WalletCoupon[] }>('dinerCoupons');
  return (await fn({ action: 'WALLET' })).data.coupons;
}

/** Cart lines with their menu category, which category coupons need. */
export function couponLines(items: CartItem[], menus: FoodCourtDataState['menus']): CouponLine[] {
  return items.map((i) => ({
    vendorId: i.vendorId,
    categoryId: menus[i.vendorId]?.categories.find((c) => c.items.some((m) => m.id === i.itemId))?.id,
    pricePaise: i.pricePaise,
    qty: i.qty,
  }));
}

/** The saving on this cart right now, or why the coupon does not apply to it. */
export function previewSaving(preview: CouponPreview, lines: CouponLine[], totalBeforePaise: number, now = Date.now()): CouponResult {
  return evaluateCoupon({ ...preview.coupon, perCustomerLimit: preview.perCustomerLimit }, lines, { now, totalBeforePaise, ...preview.context });
}
