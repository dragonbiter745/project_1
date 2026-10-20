import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import type { Coupon, CouponInput } from '@foodcourt/shared';
import { getDb } from './db';
import { getFunctionsClient, httpsCallable } from './functions';
import { ActionError } from './ops';

// Coupons for the master console: the list is read straight from Firestore (master-only by the
// rules); every change goes through couponAdmin. Usage counters only move with real payments.

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

const admin = <T>(data: Record<string, unknown>) => guarded(async () => (await httpsCallable<unknown, T>(getFunctionsClient(), 'couponAdmin')(data)).data);

export const listCoupons = () =>
  guarded(async () => {
    const snap = await getDocs(query(collection(getDb(), 'coupons'), orderBy('createdAt', 'desc'), limit(200)));
    return snap.docs.map((d) => ({ ...(d.data() as Coupon), code: d.id }));
  });

export const saveCoupon = (coupon: CouponInput, create: boolean) => admin<{ code: string }>({ action: 'SAVE', coupon, create });

export const setCouponActive = (code: string, active: boolean) => admin<{ code: string; active: boolean }>({ action: 'SET_ACTIVE', code, active });
