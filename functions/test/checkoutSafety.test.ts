import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isOpenAt } from '@foodcourt/shared';
import { db } from '../src/db';
import { startSession } from '../src/callable/startSession';
import { createCheckout } from '../src/callable/createCheckout';
import { verifyPayment } from '../src/callable/verifyPayment';
import { razorpayWebhook } from '../src/webhook/razorpayWebhook';
import { recheckExpired, reconcilePayments } from '../src/scheduled/sweeper';
import { sweepLateRefunds } from '../src/lib/payments';
import { call, fakeRazorpay, resetDb, seed, sessionFor, sign, signPayment, uniqueUid, webhookCall } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const cart = [{ itemId: 'rm-1', vendorId: 'v-rm', name: 'Paneer Roll', pricePaise: 1, veg: true, qty: 1 }];
const TOTAL = 12000;
const hhmm = (minutes: number) => `${String(Math.floor((((minutes % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String((((minutes % 1440) + 1440) % 1440) % 60).padStart(2, '0')}`;
const istNow = () => Math.floor((Date.now() + 330 * 60_000) / 60_000) % 1440;

let n = 0;
/** A fake Razorpay that hands out a new order id per create call and records every call. */
const gateway = (extra: Parameters<typeof fakeRazorpay>[0] = {}) =>
  fakeRazorpay({ createOrder: (_u, body) => ({ json: { id: `order_cs_${++n}`, amount: body.amount, currency: 'INR', receipt: body.receipt, status: 'created' } }), ...extra });
const creates = (calls: ReturnType<typeof fakeRazorpay>) => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/orders'));
const signed = (body: unknown) => webhookCall(razorpayWebhook, body, { 'x-razorpay-signature': sign(JSON.stringify(body)), 'x-razorpay-event-id': uniqueUid('evt') });
const captured = (rzpOrderId: string, amount = TOTAL, id = 'pay_cs') => ({ event: 'payment.captured', payload: { payment: { entity: { id, order_id: rzpOrderId, amount, currency: 'INR', method: 'upi' } } } });

describe('opening hours', () => {
  it('knows when a shop is open, including hours that cross midnight and bad data', () => {
    const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 11, h, m) - 330 * 60_000); // IST wall clock
    expect(isOpenAt({ open: '07:00', close: '21:00' }, at(6, 59))).toBe(false);
    expect(isOpenAt({ open: '07:00', close: '21:00' }, at(7, 0))).toBe(true);
    expect(isOpenAt({ open: '07:00', close: '21:00' }, at(20, 59))).toBe(true);
    expect(isOpenAt({ open: '07:00', close: '21:00' }, at(21, 0))).toBe(false);
    expect(isOpenAt({ open: '18:00', close: '02:00' }, at(23, 30))).toBe(true);
    expect(isOpenAt({ open: '18:00', close: '02:00' }, at(1, 59))).toBe(true);
    expect(isOpenAt({ open: '18:00', close: '02:00' }, at(2, 0))).toBe(false);
    expect(isOpenAt({ open: '18:00', close: '02:00' }, at(12, 0))).toBe(false);
    // Missing or unreadable hours never close a shop.
    expect(isOpenAt(undefined, at(3, 0))).toBe(true);
    expect(isOpenAt({ open: 'soon', close: '21:00' }, at(3, 0))).toBe(true);
    expect(isOpenAt({ open: '00:00', close: '00:00' }, at(3, 0))).toBe(true);
  });
});

describe('checkout safety', () => {
  let uid = '';
  let sessionId = '';
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: true });
    uid = uniqueUid();
    sessionId = await sessionFor(startSession, uid);
  });
  const pay = (checkoutKey: string, extra: Record<string, unknown> = {}, who = uid, session = sessionId) => call(createCheckout, { sessionId: session, checkoutKey, items: cart, ...extra }, who);
  const order = async (id: string) => (await db.doc(`orders/${id}`).get()).data()!;

  it('refuses a shop outside its hours and opens no Razorpay order', async () => {
    const now = istNow();
    await db.doc('vendors/v-rm').update({ hours: { open: hhmm(now + 120), close: hhmm(now + 240) } });
    const calls = gateway();
    await expect(pay('closed-shop-key-1')).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/closed right now/) });
    expect(calls).toHaveLength(0);
    expect((await db.collection('orders').get()).size).toBe(0);
    // Inside its hours the same cart goes through.
    await db.doc('vendors/v-rm').update({ hours: { open: hhmm(now - 60), close: hhmm(now + 60) } });
    expect((await pay('closed-shop-key-2')).status).toBe('PENDING_PAYMENT');
  });

  it('gives a second Pay press for the same cart the same order and the same Razorpay order', async () => {
    const calls = gateway();
    const first = await pay('retry-press-key-1');
    const second = await pay('retry-press-key-2');
    expect(second.orderId).toBe(first.orderId);
    expect(second.razorpayOrderId).toBe(first.razorpayOrderId);
    expect(creates(calls)).toHaveLength(1);
    expect((await db.collection('orders').get()).size).toBe(1);
    expect(first.expiresAt).toBeTypeOf('number');
  });

  it('opens one Razorpay order when two different presses arrive together', async () => {
    const calls = gateway();
    const results = await Promise.all([pay('together-key-aa'), pay('together-key-bb'), pay('together-key-cc')]);
    expect(new Set(results.map((r) => r.razorpayOrderId)).size).toBe(1);
    expect(creates(calls)).toHaveLength(1);
  });

  it('treats a different cart, coupon or diner as a different order', async () => {
    const calls = gateway();
    const a = await pay('different-key-1');
    const b = await call(createCheckout, { sessionId, checkoutKey: 'different-key-2', items: [{ ...cart[0]!, qty: 2 }] }, uid);
    const other = uniqueUid();
    const c = await pay('different-key-3', {}, other, await sessionFor(startSession, other));
    expect(new Set([a.orderId, b.orderId, c.orderId]).size).toBe(3);
    expect(creates(calls)).toHaveLength(3);
  });

  it('shows a just-paid order instead of charging the same cart again, unless the diner asks for a second one', async () => {
    const calls = gateway();
    const first = await pay('paid-once-key-1');
    expect((await signed(captured(first.razorpayOrderId))).status).toBe(200);
    expect((await order(first.orderId)).status).toBe('PAID');

    // The page reloaded on the way back from the UPI app: the cart is still there and the diner presses Pay.
    const again = await pay('paid-once-key-2');
    expect(again).toMatchObject({ orderId: first.orderId, status: 'PAID', alreadyPaid: true });
    expect(creates(calls)).toHaveLength(1);

    const repeat = await pay('paid-once-key-3', { allowRepeat: true });
    expect(repeat.orderId).not.toBe(first.orderId);
    expect(repeat.status).toBe('PENDING_PAYMENT');
    expect(creates(calls)).toHaveLength(2);
  });

  it('does not spend the checkout allowance on retries of an existing order', async () => {
    gateway();
    const first = await pay('same-key-retry-1');
    for (let i = 0; i < 12; i++) expect((await pay('same-key-retry-1')).orderId).toBe(first.orderId);
  });

  it('frees the cart when Razorpay is down, and tells an old key to start again', async () => {
    fakeRazorpay({ createOrder: () => ({ status: 503, json: { error: { description: 'down' } } }) });
    await expect(pay('gateway-down-key-1')).rejects.toMatchObject({ code: 'unavailable' });
    expect((await db.collection('checkoutLocks').get()).size).toBe(0);
    // The failed attempt can never be paid: the same key is told to start a new attempt.
    await expect(pay('gateway-down-key-1')).rejects.toMatchObject({ code: 'aborted' });
    const calls = gateway();
    expect((await pay('gateway-down-key-2')).status).toBe('PENDING_PAYMENT');
    expect(creates(calls)).toHaveLength(1);
  });

  it('refunds in full a payment that arrives after the order expired, and never sends it to a kitchen', async () => {
    const calls = gateway({ refund: (_u, body) => ({ json: { id: 'rfnd_late', amount: body.amount, receipt: body.receipt, status: 'processed' } }) });
    const o = await pay('late-capture-key-1');
    await db.doc(`orders/${o.orderId}`).update({ status: 'EXPIRED', 'payment.status': 'FAILED', expiredAt: Date.now() });

    const res = await signed(captured(o.razorpayOrderId, TOTAL, 'pay_late'));
    expect(res.status).toBe(200);
    const after = await order(o.orderId);
    expect(after.status).toBe('EXPIRED');
    expect(after.lateRefund).toMatchObject({ status: 'PROCESSED', reason: 'late', amountPaise: TOTAL, paymentId: 'pay_late', gatewayRefundId: 'rfnd_late' });
    expect((await db.collection('subOrders').get()).size).toBe(0);
    const refunds = calls.filter((c) => c.url.endsWith('/payments/pay_late/refund'));
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.body.amount).toBe(TOTAL);

    // Replays and the other paths change nothing and refund nothing more.
    await signed(captured(o.razorpayOrderId, TOTAL, 'pay_late'));
    await call(verifyPayment, { razorpay_order_id: o.razorpayOrderId, razorpay_payment_id: 'pay_late', razorpay_signature: signPayment(o.razorpayOrderId, 'pay_late') }, uid).catch(() => undefined);
    expect(calls.filter((c) => c.url.endsWith('/refund'))).toHaveLength(1);
  });

  it('tells the diner plainly when their payment landed after the order closed', async () => {
    gateway({
      getPayment: () => ({ json: { id: 'pay_slow', order_id: `order_cs_${n}`, amount: TOTAL, currency: 'INR', status: 'captured', method: 'upi' } }),
      refund: (_u, body) => ({ json: { id: 'rfnd_slow', amount: body.amount, receipt: body.receipt, status: 'pending' } }),
    });
    const o = await pay('late-verify-key-1');
    await db.doc(`orders/${o.orderId}`).update({ status: 'EXPIRED', 'payment.status': 'FAILED', expiredAt: Date.now() });
    await expect(call(verifyPayment, { razorpay_order_id: o.razorpayOrderId, razorpay_payment_id: 'pay_slow', razorpay_signature: signPayment(o.razorpayOrderId, 'pay_slow') }, uid)).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringMatching(/refunded in full/),
    });
    expect((await order(o.orderId)).lateRefund).toMatchObject({ status: 'PENDING', amountPaise: TOTAL });
  });

  it('refunds a wrong-amount payment in full and closes the order instead of leaving it flagged forever', async () => {
    const calls = gateway({ refund: (_u, body) => ({ json: { id: 'rfnd_mm', amount: body.amount, receipt: body.receipt, status: 'processed' } }) });
    const o = await pay('mismatch-key-0001');
    await signed(captured(o.razorpayOrderId, TOTAL - 500, 'pay_mm'));
    const after = await order(o.orderId);
    expect(after.status).toBe('FAILED');
    expect(after.payment.status).toBe('FLAGGED');
    expect(after.lateRefund).toMatchObject({ status: 'PROCESSED', reason: 'amount-mismatch', amountPaise: TOTAL - 500 });
    expect(calls.find((c) => c.url.endsWith('/refund'))!.body.amount).toBe(TOTAL - 500);
    expect((await db.collection('subOrders').get()).size).toBe(0);
  });

  it('finds a payment made after expiry even when its webhook never arrives', async () => {
    const calls = gateway({
      orderPayments: () => ({ json: { items: [{ id: 'pay_quiet', order_id: 'x', amount: TOTAL, currency: 'INR', status: 'captured', method: 'upi' }] } }),
      refund: (_u, body) => ({ json: { id: 'rfnd_quiet', amount: body.amount, receipt: body.receipt, status: 'pending' } }),
      getRefund: () => ({ json: { id: 'rfnd_quiet', amount: TOTAL, status: 'processed' } }),
    });
    const o = await pay('quiet-late-key-01');
    const now = Date.now();
    await db.doc(`orders/${o.orderId}`).update({ status: 'EXPIRED', 'payment.status': 'FAILED', expiredAt: now - 5 * 60_000 - 1000 });
    expect(await recheckExpired(now)).toBe(1);
    expect((await order(o.orderId)).lateRefund).toMatchObject({ status: 'PENDING', gatewayRefundId: 'rfnd_quiet' });
    // Not asked again once the refund is recorded; the sweeper then polls it to the end.
    expect(await recheckExpired(now)).toBe(0);
    expect(await sweepLateRefunds()).toBe(1);
    expect((await order(o.orderId)).lateRefund.status).toBe('PROCESSED');
    expect(calls.filter((c) => c.url.endsWith('/refund'))).toHaveLength(1);
  });

  it('expires an order Razorpay has never heard of instead of asking forever, and stamps when it expired', async () => {
    gateway({ orderPayments: () => ({ status: 400, json: { error: { description: 'The id provided does not exist' } } }) });
    const o = await pay('unknown-rzp-key-1');
    await db.doc(`orders/${o.orderId}`).update({ createdAt: Date.now() - 45 * 60_000, expiresAt: Date.now() - 30 * 60_000 });
    expect((await reconcilePayments()).expired).toBe(1);
    const after = await order(o.orderId);
    expect(after.status).toBe('EXPIRED');
    expect(after.expiredAt).toBeTypeOf('number');
  });
});
