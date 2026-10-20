import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateCoupon, getIstDateKey, type PublicCoupon } from '@foodcourt/shared';
import { db } from '../src/db';
import { startSession } from '../src/callable/startSession';
import { createCheckout } from '../src/callable/createCheckout';
import { vendorAction } from '../src/callable/vendorAction';
import { couponAdmin, dinerCoupons } from '../src/callable/coupons';
import { buildFinanceReport, buildFounderIncome } from '../src/callable/finance';
import { cashfreeWebhook } from '../src/webhook/cashfreeWebhook';
import { call, fakeCashfree, resetDb, seed, sessionFor, sign, uniqueUid, webhookCall } from './helpers';

const master = { role: 'master', email: 'boss@example.test' };
const google = { firebase: { sign_in_provider: 'google.com' }, email: 'diner@example.test' };
const rollAndDosa = [
  { itemId: 'rm-1', vendorId: 'v-rm', name: 'Paneer Roll', pricePaise: 1, veg: true, qty: 2 }, // ₹240
  { itemId: 'sv-1', vendorId: 'v-sv', name: 'Masala Dosa', pricePaise: 1, veg: true, qty: 1 }, // ₹70
];
const FULL = 31000;

const base = {
  title: 'Launch week',
  minOrderPaise: 0,
  scope: { kind: 'ALL' as const },
  audience: 'EVERYONE' as const,
  firstOrderOnly: false,
  showInWallet: true,
  startsAt: 0,
  endsAt: null,
  totalLimit: null,
  perCustomerLimit: 1,
};

const createCoupon = (coupon: Record<string, unknown>) => call(couponAdmin, { action: 'SAVE', create: true, coupon: { ...base, ...coupon } }, 'boss', master);

afterEach(() => vi.unstubAllGlobals());

describe('evaluateCoupon', () => {
  const lines = [
    { vendorId: 'a', categoryId: 'rolls', pricePaise: 10000, qty: 2 },
    { vendorId: 'b', categoryId: 'dosa', pricePaise: 5000, qty: 1 },
  ];
  const ctx = { now: 1000, member: true, previousOrders: 0, usedByDiner: 0, totalBeforePaise: 25000 };
  const pct: PublicCoupon = { code: 'P', title: 't', kind: 'PERCENT', percentBps: 2000, maxDiscountPaise: 3000, minOrderPaise: 0, scope: { kind: 'ALL' }, audience: 'EVERYONE', firstOrderOnly: false, endsAt: null };

  it('takes a percentage off, up to its cap', () => {
    expect(evaluateCoupon(pct, lines, ctx)).toEqual({ ok: true, discountPaise: 3000, eligiblePaise: 25000 });
    expect(evaluateCoupon({ ...pct, maxDiscountPaise: null }, lines, ctx)).toMatchObject({ discountPaise: 5000 });
  });

  it('only counts dishes from the chosen shops or categories', () => {
    expect(evaluateCoupon({ ...pct, maxDiscountPaise: null, scope: { kind: 'VENDORS', vendorIds: ['b'] } }, lines, ctx)).toMatchObject({ discountPaise: 1000, eligiblePaise: 5000 });
    expect(evaluateCoupon({ ...pct, maxDiscountPaise: null, scope: { kind: 'CATEGORIES', categories: [{ vendorId: 'a', categoryId: 'rolls' }] } }, lines, ctx)).toMatchObject({ discountPaise: 4000 });
    expect(evaluateCoupon({ ...pct, scope: { kind: 'VENDORS', vendorIds: ['z'] } }, lines, ctx)).toMatchObject({ ok: false });
  });

  it('never takes more than the eligible dishes or the payment below ₹1', () => {
    const flat: PublicCoupon = { ...pct, kind: 'FLAT', flatPaise: 100000, percentBps: undefined };
    expect(evaluateCoupon(flat, lines, { ...ctx, totalBeforePaise: 25000 })).toMatchObject({ discountPaise: 24900 });
    expect(evaluateCoupon({ ...flat, scope: { kind: 'VENDORS', vendorIds: ['b'] } }, lines, ctx)).toMatchObject({ discountPaise: 5000 });
  });

  it('explains why it does not apply', () => {
    expect(evaluateCoupon({ ...pct, minOrderPaise: 30000 }, lines, ctx)).toEqual({ ok: false, reason: 'Add ₹50 more of eligible dishes to use this coupon.' });
    expect(evaluateCoupon({ ...pct, audience: 'MEMBERS' }, lines, { ...ctx, member: false })).toMatchObject({ reason: 'Sign in to use this coupon.' });
    expect(evaluateCoupon({ ...pct, firstOrderOnly: true }, lines, { ...ctx, previousOrders: 2 })).toMatchObject({ reason: 'This coupon is for your first order.' });
    expect(evaluateCoupon({ ...pct, perCustomerLimit: 1 } as never, lines, { ...ctx, usedByDiner: 1 })).toMatchObject({ reason: "You've already used this coupon." });
    expect(evaluateCoupon({ ...pct, endsAt: 500 }, lines, ctx)).toMatchObject({ reason: 'This coupon has expired.' });
  });
});

describe('couponAdmin', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: true });
  });

  it('is for the court manager only, and codes are unique', async () => {
    await expect(call(couponAdmin, { action: 'SAVE', create: true, coupon: { ...base, code: 'X1X', kind: 'FLAT', flatPaise: 1000 } }, uniqueUid())).rejects.toMatchObject({ code: 'permission-denied' });
    await createCoupon({ code: 'save-20', kind: 'PERCENT', percentBps: 2000, maxDiscountPaise: 5000 });
    const saved = (await db.doc('coupons/SAVE-20').get()).data()!;
    expect(saved).toMatchObject({ code: 'SAVE-20', active: true, usedCount: 0, discountGivenPaise: 0, createdBy: 'boss@example.test' });
    await expect(createCoupon({ code: 'SAVE-20', kind: 'FLAT', flatPaise: 1000 })).rejects.toMatchObject({ code: 'already-exists' });
  });

  it('refuses shops or categories that do not exist, and a coupon without an amount', async () => {
    await expect(createCoupon({ code: 'ROLLS', kind: 'FLAT', flatPaise: 1000, scope: { kind: 'CATEGORIES', categories: [{ vendorId: 'v-rm', categoryId: 'nope' }] } })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(createCoupon({ code: 'GHOST', kind: 'FLAT', flatPaise: 1000, scope: { kind: 'VENDORS', vendorIds: ['v-ghost'] } })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(createCoupon({ code: 'EMPTY', kind: 'PERCENT' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await createCoupon({ code: 'ROLLS', kind: 'FLAT', flatPaise: 1000, scope: { kind: 'CATEGORIES', categories: [{ vendorId: 'v-rm', categoryId: 'c' }] } });
  });

  it('pauses and resumes', async () => {
    await createCoupon({ code: 'PAUSE-ME', kind: 'FLAT', flatPaise: 1000 });
    await call(couponAdmin, { action: 'SET_ACTIVE', code: 'pause-me', active: false }, 'boss', master);
    expect((await db.doc('coupons/PAUSE-ME').get()).data()!.active).toBe(false);
  });
});

describe('coupons at checkout', () => {
  let uid = '';
  let sessionId = '';
  let cfCalls: Array<{ body: any }> = [];

  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: true });
    await db.doc('vendors/v-rm').update({ feePct: 10 });
    uid = uniqueUid();
    sessionId = await sessionFor(startSession, uid);
    cfCalls = fakeCashfree({ createOrder: (_u, body) => ({ json: { order_id: body.order_id, payment_session_id: 'ps_c', order_status: 'ACTIVE' } }) });
  });

  const pay = async (orderId: string, amountPaise: number) => {
    const body = {
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: { order: { order_id: orderId, order_amount: amountPaise / 100, order_currency: 'INR' }, payment: { payment_status: 'SUCCESS', payment_amount: amountPaise / 100, cf_payment_id: 777, payment_group: 'upi' } },
    };
    const ts = String(Date.now());
    return webhookCall(cashfreeWebhook as any, body, { 'x-webhook-timestamp': ts, 'x-webhook-signature': sign(JSON.stringify(body), ts) });
  };
  const checkout = (key: string, couponCode?: string, who = uid, extra: Record<string, unknown> = {}) =>
    call(createCheckout, { sessionId, checkoutKey: key, items: rollAndDosa, customerPhone: '9123456780', ...(couponCode ? { couponCode } : {}) }, who, extra);

  it('charges the diner less while each shop keeps its full price and commission', async () => {
    await createCoupon({ code: 'ROLL50', kind: 'FLAT', flatPaise: 5000, scope: { kind: 'VENDORS', vendorIds: ['v-rm'] } });
    const res = await checkout('coupon-key-01', 'roll50');
    expect(res.totalPaise).toBe(FULL - 5000);
    expect(cfCalls[0]!.body.order_amount).toBe((FULL - 5000) / 100);
    const order = (await db.doc(`orders/${res.orderId}`).get()).data()!;
    expect(order.totals).toMatchObject({ subtotalPaise: FULL, discountPaise: 5000, totalPaise: FULL - 5000 });
    expect(order.coupon).toEqual({ code: 'ROLL50', title: 'Launch week', discountPaise: 5000 });

    expect((await pay(res.orderId, FULL - 5000)).status).toBe(200);
    const rm = (await db.doc(`subOrders/${res.orderId}__v-rm`).get()).data()!;
    expect(rm).toMatchObject({ subtotalPaise: 24000, commissionPaise: 2400 });
    expect((await db.doc('coupons/ROLL50').get()).data()).toMatchObject({ usedCount: 1, discountGivenPaise: 5000 });

    const today = getIstDateKey();
    const report = await buildFinanceReport(today, today);
    expect(report).toMatchObject({ collectedPaise: FULL - 5000, paidOrders: 1, couponsPaise: 5000, commissionPaise: 2400 });
    expect(report.shops.find((s) => s.vendorId === 'v-rm')).toMatchObject({ salesPaise: 24000, payablePaise: 21600 });
    expect((await buildFounderIncome(1)).lifetimeIncomePaise).toBe(2400 - 5000);
  });

  it('is single-use per diner and one payment at a time', async () => {
    await createCoupon({ code: 'ONCE', kind: 'FLAT', flatPaise: 1000 });
    const first = await checkout('coupon-key-02', 'ONCE');
    // A second payment window with the same coupon while the first is open.
    await expect(checkout('coupon-key-03', 'ONCE')).rejects.toMatchObject({ code: 'failed-precondition' });
    // Retrying the same checkout is the same order, not a second use.
    expect((await checkout('coupon-key-02', 'ONCE')).orderId).toBe(first.orderId);
    await pay(first.orderId, FULL - 1000);
    await expect(checkout('coupon-key-04', 'ONCE')).rejects.toMatchObject({ message: "You've already used this coupon." });
  });

  it('frees the coupon when the payment could not even start', async () => {
    await createCoupon({ code: 'RETRY', kind: 'FLAT', flatPaise: 1000 });
    vi.unstubAllGlobals();
    fakeCashfree({ createOrder: () => ({ status: 503, json: { message: 'down' } }) });
    await expect(checkout('coupon-key-05', 'RETRY')).rejects.toMatchObject({ code: 'unavailable' });
    vi.unstubAllGlobals();
    fakeCashfree({ createOrder: (_u, body) => ({ json: { order_id: body.order_id, payment_session_id: 'ps_d', order_status: 'ACTIVE' } }) });
    expect((await checkout('coupon-key-06', 'RETRY')).totalPaise).toBe(FULL - 1000);
  });

  it('checks who may use it and when, on the server', async () => {
    await createCoupon({ code: 'MEMBERS', kind: 'FLAT', flatPaise: 1000, audience: 'MEMBERS' });
    await createCoupon({ code: 'LATER', kind: 'FLAT', flatPaise: 1000, startsAt: Date.now() + 86_400_000 });
    await createCoupon({ code: 'BIGBASKET', kind: 'FLAT', flatPaise: 1000, minOrderPaise: 100000 });
    await expect(checkout('coupon-key-07', 'MEMBERS')).rejects.toMatchObject({ message: 'Sign in to use this coupon.' });
    await expect(checkout('coupon-key-08', 'LATER')).rejects.toMatchObject({ message: 'This coupon has not started yet.' });
    await expect(checkout('coupon-key-09', 'BIGBASKET')).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(checkout('coupon-key-10', 'NOSUCH')).rejects.toMatchObject({ code: 'not-found' });
    const ok = await checkout('coupon-key-11', 'MEMBERS', uid, google);
    expect(ok.totalPaise).toBe(FULL - 1000);
  });

  it('gives the use back when every shop rejects the order', async () => {
    await createCoupon({ code: 'BACK', kind: 'FLAT', flatPaise: 2000 });
    const res = await checkout('coupon-key-12', 'BACK');
    await pay(res.orderId, FULL - 2000);
    await call(vendorAction, { subOrderId: `${res.orderId}__v-rm`, action: 'REJECT', reason: 'Out of paneer' }, 'staff-rm', { role: 'vendorStaff', vendorId: 'v-rm' });
    expect((await db.doc('coupons/BACK').get()).data()!.usedCount).toBe(1);
    await call(vendorAction, { subOrderId: `${res.orderId}__v-sv`, action: 'REJECT', reason: 'Closed' }, 'staff-sv', { role: 'vendorStaff', vendorId: 'v-sv' });
    expect((await db.doc('coupons/BACK').get()).data()).toMatchObject({ usedCount: 0, discountGivenPaise: 0 });
    expect((await db.doc(`orders/${res.orderId}`).get()).data()).toMatchObject({ coupon: { released: true }, couponCostPaise: 0 });
    // Usable again.
    expect((await checkout('coupon-key-13', 'BACK')).totalPaise).toBe(FULL - 2000);
  });

  it('is not accepted when diners pay at the counter', async () => {
    await createCoupon({ code: 'COUNTER', kind: 'FLAT', flatPaise: 1000 });
    await db.doc('config/global').update({ 'flags.paymentsEnabled': false });
    await expect(checkout('coupon-key-14', 'COUNTER')).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(call(dinerCoupons, { action: 'PREVIEW', code: 'COUNTER' }, uid)).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('dinerCoupons', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: true });
  });

  it('previews a valid code with its terms, and explains an unusable one', async () => {
    await createCoupon({ code: 'TWENTY', kind: 'PERCENT', percentBps: 2000, maxDiscountPaise: 5000, showInWallet: false });
    await createCoupon({ code: 'SIGNIN', kind: 'FLAT', flatPaise: 1000, audience: 'MEMBERS' });
    const uid = uniqueUid();
    const preview = await call(dinerCoupons, { action: 'PREVIEW', code: ' twenty ' }, uid);
    expect(preview.coupon).toMatchObject({ code: 'TWENTY', kind: 'PERCENT', percentBps: 2000, maxDiscountPaise: 5000 });
    expect(preview.coupon.usedCount).toBeUndefined();
    expect(preview.context).toEqual({ member: false, previousOrders: 0, usedByDiner: 0 });
    await expect(call(dinerCoupons, { action: 'PREVIEW', code: 'SIGNIN' }, uid)).rejects.toMatchObject({ message: 'Sign in to use this coupon.' });
    await expect(call(dinerCoupons, { action: 'PREVIEW', code: 'NOPE1' }, uid)).rejects.toMatchObject({ code: 'not-found' });
  });

  it('lists wallet coupons only, live ones first, without secret codes', async () => {
    await createCoupon({ code: 'WALLET1', kind: 'FLAT', flatPaise: 1000 });
    await createCoupon({ code: 'SECRET', kind: 'FLAT', flatPaise: 1000, showInWallet: false });
    await createCoupon({ code: 'MEMBERS2', kind: 'FLAT', flatPaise: 1000, audience: 'MEMBERS' });
    await createCoupon({ code: 'OLD', kind: 'FLAT', flatPaise: 1000, startsAt: 1, endsAt: 2 });
    const { coupons } = await call(dinerCoupons, { action: 'WALLET' }, uniqueUid());
    expect(coupons.map((c: any) => c.coupon.code)).toEqual(['WALLET1', 'MEMBERS2']);
    expect(coupons[1]).toMatchObject({ usable: false, reason: 'Sign in to use this coupon.' });
  });

  it('rate-limits guessing codes', async () => {
    const uid = uniqueUid();
    for (let i = 0; i < 20; i++) await call(dinerCoupons, { action: 'PREVIEW', code: `GUESS${i}` }, uid).catch(() => undefined);
    await expect(call(dinerCoupons, { action: 'PREVIEW', code: 'GUESS99' }, uid)).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
});
