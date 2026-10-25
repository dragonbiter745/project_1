import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { CouponActionSchema, PreviewCouponSchema, couponBlocked, toPublicCoupon, type Coupon, type CouponPreview, type GlobalConfig, type PublicCoupon } from '@foodcourt/shared';
import { REGION } from '../config';
import { db } from '../db';
import { couponRef, dinerContext, readCoupon } from '../lib/coupons';
import { limitLocal, limitShared, requireUid, roleOf } from '../lib/guard';
import { signInProvider } from './account';

/** The court manager creates, edits and pauses coupons. Usage counters are only ever moved by payments. */
export const couponAdmin = onCall({ region: REGION, maxInstances: 10, timeoutSeconds: 30 }, async (req) => {
  const uid = requireUid(req);
  if (roleOf(req).role !== 'master') throw new HttpsError('permission-denied', 'Only the court manager can change coupons.');
  await limitShared(`coupon-admin:${uid}`, 60, 300);
  const parsed = CouponActionSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Check the coupon details.');
  const input = parsed.data;
  const by = typeof req.auth?.token.email === 'string' ? req.auth.token.email : uid;
  const now = Date.now();

  if (input.action === 'SET_ACTIVE') {
    const ref = couponRef(input.code);
    if (!(await ref.get()).exists) throw new HttpsError('not-found', 'No such coupon.');
    await ref.update({ active: input.active, updatedAt: now });
    await db.collection('auditLogs').add({ at: now, by, area: 'coupons', action: input.active ? 'RESUME' : 'PAUSE', code: input.code });
    return { code: input.code, active: input.active };
  }

  const c = input.coupon;
  const ref = couponRef(c.code);
  // Shops and categories must exist, so a typo can never make a coupon that applies to nothing.
  const vendorIds = c.scope.kind === 'VENDORS' ? c.scope.vendorIds : c.scope.kind === 'CATEGORIES' ? [...new Set(c.scope.categories.map((x) => x.vendorId))] : [];
  if (vendorIds.length > 0) {
    const menus = await Promise.all(vendorIds.map((v) => db.collection('menus').doc(v).get()));
    if (menus.some((m) => !m.exists)) throw new HttpsError('invalid-argument', 'One of the chosen shops no longer exists.');
    if (c.scope.kind === 'CATEGORIES') {
      const known = new Set(menus.flatMap((m) => ((m.data()?.categories ?? []) as Array<{ id: string }>).map((cat) => `${m.id}:${cat.id}`)));
      if (c.scope.categories.some((x) => !known.has(`${x.vendorId}:${x.categoryId}`))) {
        throw new HttpsError('invalid-argument', 'One of the chosen categories is no longer on the menu.');
      }
    }
  }
  const terms = {
    code: c.code,
    title: c.title,
    description: c.description ?? '',
    kind: c.kind,
    percentBps: c.kind === 'PERCENT' ? c.percentBps : null,
    flatPaise: c.kind === 'FLAT' ? c.flatPaise : null,
    maxDiscountPaise: c.kind === 'PERCENT' ? (c.maxDiscountPaise ?? null) : null,
    minOrderPaise: c.minOrderPaise,
    scope: c.scope,
    audience: c.audience,
    firstOrderOnly: c.firstOrderOnly,
    showInWallet: c.showInWallet,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    totalLimit: c.totalLimit,
    perCustomerLimit: c.perCustomerLimit,
    updatedAt: now,
  };
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (input.create) {
      if (snap.exists) throw new HttpsError('already-exists', `${c.code} is already taken. Pick another code.`);
      tx.set(ref, { ...terms, active: true, usedCount: 0, discountGivenPaise: 0, createdAt: now, createdBy: by });
    } else {
      if (!snap.exists) throw new HttpsError('not-found', 'No such coupon.');
      tx.update(ref, terms);
    }
  });
  await db.collection('auditLogs').add({ at: now, by, area: 'coupons', action: input.create ? 'CREATE' : 'EDIT', code: c.code });
  return { code: c.code };
});

const DinerSchema = z.discriminatedUnion('action', [z.object({ action: z.literal('PREVIEW') }).merge(PreviewCouponSchema), z.object({ action: z.literal('WALLET') })]);

export interface WalletCoupon {
  coupon: PublicCoupon;
  usable: boolean;
  /** Why it cannot be used right now (sign in, first order only, already used). */
  reason: string | null;
  usesLeft: number;
}

/**
 * For diners: check a code before paying (the cart previews the saving from the terms returned),
 * and list the coupons shown in "My coupons". Rate-limited so codes cannot be guessed.
 */
export const dinerCoupons = onCall({ region: REGION, maxInstances: 30, concurrency: 80, timeoutSeconds: 20 }, async (req) => {
  const uid = requireUid(req);
  const parsed = DinerSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Check the code.');
  const provider = signInProvider(req);
  const member = Boolean(provider && provider !== 'anonymous');
  const now = Date.now();

  if (parsed.data.action === 'WALLET') {
    limitLocal(`coupon-wallet:${uid}`, 60, 300);
    const snap = await db.collection('coupons').where('showInWallet', '==', true).where('active', '==', true).limit(50).get();
    const live = snap.docs
      .map((d) => ({ ...(d.data() as Coupon), code: d.id }))
      .filter((c) => c.startsAt <= now && (c.endsAt === null || c.endsAt > now) && (c.totalLimit === null || c.usedCount < c.totalLimit));
    const coupons: WalletCoupon[] = await Promise.all(
      live.map(async (c) => {
        const ctx = await dinerContext(c.code, uid, member);
        const reason = couponBlocked(c, { now, ...ctx });
        return { coupon: toPublicCoupon(c), usable: reason === null, reason, usesLeft: Math.max(0, c.perCustomerLimit - ctx.usedByDiner) };
      })
    );
    return { coupons: coupons.sort((a, b) => Number(b.usable) - Number(a.usable) || (a.coupon.endsAt ?? Infinity) - (b.coupon.endsAt ?? Infinity)) };
  }

  limitLocal(`coupon-preview:${uid}`, 20, 600);
  const config = (await db.collection('config').doc('global').get()).data() as GlobalConfig | undefined;
  if (config && !config.flags.paymentsEnabled) throw new HttpsError('failed-precondition', 'Coupons work with online payment, which is off right now.');
  const coupon = await readCoupon(parsed.data.code);
  const ctx = await dinerContext(coupon.code, uid, member);
  // Everything that does not depend on the cart is checked here; the cart checks the dishes.
  const blocked = couponBlocked(coupon, { now, ...ctx });
  if (blocked) throw new HttpsError('failed-precondition', blocked);
  const preview: CouponPreview = { coupon: toPublicCoupon(coupon), context: ctx, perCustomerLimit: coupon.perCustomerLimit };
  return preview;
});
