import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import { startSession } from '../src/callable/startSession';
import { createCheckout } from '../src/callable/createCheckout';
import { vendorAction } from '../src/callable/vendorAction';
import { reportIssue } from '../src/callable/reportIssue';
import { adminAction } from '../src/callable/adminAction';
import { razorpayWebhook } from '../src/webhook/razorpayWebhook';
import { verifyPayment } from '../src/callable/verifyPayment';
import { reconcilePayments, timeOutUnaccepted } from '../src/scheduled/sweeper';
import { processRefund } from '../src/lib/refunds';
import { QR, call, fakeRazorpay, resetDb, seed, sessionFor, sign, signPayment, uniqueUid, webhookCall } from './helpers';

const cart = [
  { itemId: 'rm-1', vendorId: 'v-rm', name: 'Paneer Roll', pricePaise: 1, veg: true, qty: 2 },
  { itemId: 'sv-1', vendorId: 'v-sv', name: 'Masala Dosa', pricePaise: 1, veg: true, qty: 1 },
];
const expectedTotal = 12000 * 2 + 7000; // tax-inclusive config: total equals subtotal

afterEach(() => vi.unstubAllGlobals());

describe('startSession', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: false });
  });

  it('needs a signed-in diner and an unguessable QR token', async () => {
    await expect(call(startSession, { qrToken: QR })).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(call(startSession, { tableCode: 'T14' }, uniqueUid())).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call(startSession, { qrToken: 'T14' }, uniqueUid())).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call(startSession, { qrToken: 'A'.repeat(22) }, uniqueUid())).rejects.toMatchObject({ code: 'not-found' });
  });

  it('opens one session per diner per table per day and resumes it', async () => {
    const uid = uniqueUid();
    const a = await call(startSession, { qrToken: QR }, uid);
    const b = await call(startSession, { qrToken: QR }, uid);
    expect(a.sessionId).toBe(b.sessionId);
    expect(a.tableLabel).toBe('T-14');
    const other = await call(startSession, { qrToken: QR }, uniqueUid());
    expect(other.dailyNo).toBe(a.dailyNo + 1);
  });

  it('rate-limits one diner hammering the endpoint', async () => {
    const uid = uniqueUid();
    for (let i = 0; i < 30; i++) await call(startSession, { qrToken: QR }, uid);
    await expect(call(startSession, { qrToken: QR }, uid)).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
});

describe('createCheckout · pay at counter', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: false });
  });

  it('ignores phone prices, confirms the order and creates one ticket per shop', async () => {
    const uid = uniqueUid();
    const sessionId = await sessionFor(startSession, uid);
    const res = await call(createCheckout, { sessionId, checkoutKey: 'key-0001-abc', items: cart }, uid);
    expect(res.status).toBe('PAID');
    expect(res.totalPaise).toBe(expectedTotal);
    const tickets = await db.collection('subOrders').where('orderId', '==', res.orderId).get();
    expect(tickets.size).toBe(2);
    const byShop = Object.fromEntries(tickets.docs.map((d) => [d.data().vendorId, d.data()]));
    expect(byShop['v-rm'].token).toBe('RM-001');
    expect(byShop['v-sv'].token).toBe('SV-001');
    expect(byShop['v-rm'].subtotalPaise).toBe(24000);
    expect(byShop['v-rm'].uid).toBe(uid);
    expect(byShop['v-rm'].tableLabel).toBe('T-14');
  });

  it('is idempotent for the same checkout key', async () => {
    const uid = uniqueUid();
    const sessionId = await sessionFor(startSession, uid);
    const a = await call(createCheckout, { sessionId, checkoutKey: 'same-key-001', items: cart }, uid);
    const b = await call(createCheckout, { sessionId, checkoutKey: 'same-key-001', items: cart }, uid);
    expect(b.orderId).toBe(a.orderId);
    expect((await db.collection('subOrders').where('orderId', '==', a.orderId).get()).size).toBe(2);
  });

  it("rejects someone else's session, sold-out dishes and paused shops", async () => {
    const owner = uniqueUid();
    const sessionId = await sessionFor(startSession, owner);
    await expect(call(createCheckout, { sessionId, checkoutKey: 'steal-key-01', items: cart }, uniqueUid())).rejects.toMatchObject({ code: 'failed-precondition' });

    await db.doc('availability/v-sv').update({ 'unavailable.sv-1': true });
    await expect(call(createCheckout, { sessionId, checkoutKey: 'soldout-key-1', items: cart }, owner)).rejects.toMatchObject({ code: 'failed-precondition' });
    await db.doc('availability/v-sv').update({ unavailable: {} });

    await db.doc('vendors/v-rm').update({ acceptingOrders: false });
    await expect(call(createCheckout, { sessionId, checkoutKey: 'paused-key-1', items: cart }, owner)).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('createCheckout · online payment', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: true });
  });

  it('lets a guest pay with no phone number: nothing about the diner is stored', async () => {
    const uid = uniqueUid();
    const sessionId = await sessionFor(startSession, uid);
    fakeRazorpay({ createOrder: (_u, body) => ({ json: { id: 'order_guest', amount: body.amount, currency: 'INR', receipt: body.receipt, status: 'created' } }) });
    const res = await call(createCheckout, { sessionId, checkoutKey: 'online-key-01', items: cart }, uid);
    expect(res).toMatchObject({ status: 'PENDING_PAYMENT', razorpayOrderId: 'order_guest', razorpayKeyId: 'rzp_test_unit' });
    const order = (await db.collection('orders').doc(res.orderId).get()).data()!;
    expect(order.customerPhone).toBeUndefined();
    expect(order.status).toBe('PENDING_PAYMENT');
  });

  it('creates a Razorpay order for the server total in paise and keeps a real phone number', async () => {
    const uid = uniqueUid();
    const sessionId = await sessionFor(startSession, uid);
    const calls = fakeRazorpay({ createOrder: (_u, body) => ({ json: { id: 'order_123', amount: body.amount, currency: 'INR', receipt: body.receipt, status: 'created' } }) });
    const res = await call(createCheckout, { sessionId, checkoutKey: 'online-key-02', items: cart, customerPhone: '9123456780' }, uid);
    expect(res).toMatchObject({ status: 'PENDING_PAYMENT', razorpayOrderId: 'order_123', razorpayKeyId: 'rzp_test_unit' });
    expect(calls[0]!.body).toMatchObject({ amount: expectedTotal, currency: 'INR', receipt: res.orderId });
    expect(calls[0]!.headers.Authorization).toBe(`Basic ${Buffer.from('rzp_test_unit:test-key-secret').toString('base64')}`);
    expect((await db.collection('orders').doc(res.orderId).get()).data()!.payment.rzpOrderId).toBe('order_123');
    expect((await db.collection('subOrders').get()).size).toBe(0);
  });

  it('never pretends to succeed when Razorpay is down', async () => {
    const uid = uniqueUid();
    const sessionId = await sessionFor(startSession, uid);
    fakeRazorpay({ createOrder: () => ({ status: 503, json: { error: { description: 'down' } } }) });
    await expect(call(createCheckout, { sessionId, checkoutKey: 'rzp-down-key-1', items: cart, customerPhone: '9123456780' }, uid)).rejects.toMatchObject({ code: 'unavailable' });
    const orders = await db.collection('orders').get();
    expect(orders.docs[0]!.data().status).toBe('FAILED');
  });
});

describe('razorpayWebhook', () => {
  let orderId = '';
  let owner = '';
  const rzpOrderId = 'order_wh1';
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: true });
    owner = uniqueUid();
    const sessionId = await sessionFor(startSession, owner);
    fakeRazorpay({ createOrder: (_u, body) => ({ json: { id: rzpOrderId, amount: body.amount, currency: 'INR', receipt: body.receipt, status: 'created' } }) });
    orderId = (await call(createCheckout, { sessionId, checkoutKey: `wh-${owner}`, items: cart, customerPhone: '9123456780' }, owner)).orderId;
    vi.unstubAllGlobals();
  });

  const captured = (amount = expectedTotal, paymentId = 'pay_555') => ({
    event: 'payment.captured',
    payload: { payment: { entity: { id: paymentId, order_id: rzpOrderId, amount, currency: 'INR', status: 'captured', method: 'upi' } } },
  });
  const send = (body: unknown, signature?: string) => webhookCall(razorpayWebhook as any, body, signature === undefined ? {} : { 'x-razorpay-signature': signature });
  const signed = (body: unknown) => send(body, sign(JSON.stringify(body)));

  it('rejects requests without a valid signature, so nobody can fake a payment', async () => {
    const body = captured();
    expect((await send(body)).status).toBe(401);
    expect((await send(body, 'forged')).status).toBe(401);
    expect((await send(body, sign(JSON.stringify(body), 'some-other-secret'))).status).toBe(401);
    expect((await db.doc(`orders/${orderId}`).get()).data()!.status).toBe('PENDING_PAYMENT');
  });

  it('marks a multi-shop order paid, creates both tickets, and ignores replays', async () => {
    const body = captured();
    expect((await signed(body)).status).toBe(200);
    expect((await signed(body)).status).toBe(200);
    expect((await signed({ ...body, event: 'order.paid' })).status).toBe(200);
    const order = (await db.doc(`orders/${orderId}`).get()).data()!;
    expect(order.status).toBe('PAID');
    expect(order.payment).toMatchObject({ status: 'SUCCESS', rzpPaymentId: 'pay_555', rzpOrderId });
    expect((await db.collection('subOrders').where('orderId', '==', orderId).get()).size).toBe(2);
  });

  it('refuses to fulfil a payment whose amount does not match the order', async () => {
    await signed(captured(100));
    const order = (await db.doc(`orders/${orderId}`).get()).data()!;
    // Never fulfilled, and never left hanging: the order is closed and the wrong amount is owed back in full.
    expect(order.status).toBe('FAILED');
    expect(order.payment.status).toBe('FLAGGED');
    expect(order.lateRefund).toMatchObject({ reason: 'amount-mismatch', amountPaise: 100 });
    expect((await db.collection('subOrders').get()).size).toBe(0);
  });

  it('keeps the order payable after a failed attempt and acknowledges unknown events and orders', async () => {
    await signed({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_x', order_id: rzpOrderId, amount: expectedTotal, currency: 'INR' } } } });
    const order = (await db.doc(`orders/${orderId}`).get()).data()!;
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.payment.lastAttempt).toBe('FAILED');
    expect((await signed({ event: 'payout.processed', payload: {} })).status).toBe(200);
    const stranger = captured();
    stranger.payload.payment.entity.order_id = 'order_not_ours';
    expect((await signed(stranger)).status).toBe(200);
    expect((await db.collection('subOrders').get()).size).toBe(0);
  });

  it('settles a refund from refund.processed by the refund receipt', async () => {
    await db.doc('subOrders/t1').set({ orderId, refund: { status: 'PENDING', amountPaise: 100, refundId: 'rf_t1' } });
    await signed({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_9', receipt: 'rf_t1', status: 'processed' } } } });
    expect((await db.doc('subOrders/t1').get()).data()!.refund).toMatchObject({ status: 'PROCESSED', gatewayRefundId: 'rfnd_9' });
  });

  it('reconciles a payment whose webhook never arrived', async () => {
    await db.doc(`orders/${orderId}`).update({ createdAt: Date.now() - 5 * 60_000 });
    fakeRazorpay({ orderPayments: () => ({ json: { items: [{ id: 'pay_rec', order_id: rzpOrderId, amount: expectedTotal, currency: 'INR', status: 'captured', method: 'card' }] } }) });
    expect((await reconcilePayments()).paid).toBe(1);
    expect((await db.collection('subOrders').where('orderId', '==', orderId).get()).size).toBe(2);
  });

  describe('verifyPayment', () => {
    const payment = (over: Record<string, unknown> = {}) => ({ id: 'pay_v1', order_id: rzpOrderId, amount: expectedTotal, currency: 'INR', status: 'captured', method: 'upi', ...over });
    const req = (over: Record<string, string> = {}) => ({ razorpay_order_id: rzpOrderId, razorpay_payment_id: 'pay_v1', razorpay_signature: signPayment(rzpOrderId, 'pay_v1'), ...over });

    it('rejects a bad signature or missing fields and does not mark anything paid', async () => {
      await expect(call(verifyPayment, req({ razorpay_signature: 'forged' }), owner)).rejects.toMatchObject({ code: 'invalid-argument' });
      await expect(call(verifyPayment, req({ razorpay_signature: signPayment(rzpOrderId, 'pay_other') }), owner)).rejects.toMatchObject({ code: 'invalid-argument' });
      await expect(call(verifyPayment, { razorpay_order_id: rzpOrderId }, owner)).rejects.toMatchObject({ code: 'invalid-argument' });
      expect((await db.doc(`orders/${orderId}`).get()).data()!.status).toBe('PENDING_PAYMENT');
    });

    it("won't settle someone else's order", async () => {
      fakeRazorpay({ getPayment: () => ({ json: payment() }) });
      await expect(call(verifyPayment, req(), uniqueUid())).rejects.toMatchObject({ code: 'not-found' });
    });

    it('settles once Razorpay confirms the captured payment, and again harmlessly', async () => {
      fakeRazorpay({ getPayment: () => ({ json: payment() }) });
      expect(await call(verifyPayment, req(), owner)).toEqual({ verified: true, settled: true });
      expect(await call(verifyPayment, req(), owner)).toEqual({ verified: true, settled: true });
      expect((await db.doc(`orders/${orderId}`).get()).data()!.status).toBe('PAID');
      expect((await db.collection('subOrders').where('orderId', '==', orderId).get()).size).toBe(2);
    });

    it('leaves an uncaptured payment to the webhook, and flags an amount mismatch', async () => {
      fakeRazorpay({ getPayment: () => ({ json: payment({ status: 'authorized' }) }) });
      expect(await call(verifyPayment, req(), owner)).toEqual({ verified: true, settled: false });
      expect((await db.doc(`orders/${orderId}`).get()).data()!.status).toBe('PENDING_PAYMENT');
      fakeRazorpay({ getPayment: () => ({ json: payment({ amount: 100 }) }) });
      await expect(call(verifyPayment, req(), owner)).rejects.toMatchObject({ code: 'failed-precondition' });
      expect((await db.doc(`orders/${orderId}`).get()).data()!.payment.status).toBe('FLAGGED');
    });
  });
});

describe('vendorAction and refunds', () => {
  let ticketId = '';
  let orderId = '';
  let diner = '';
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: false });
    diner = uniqueUid();
    const sessionId = await sessionFor(startSession, diner);
    orderId = (await call(createCheckout, { sessionId, checkoutKey: `va-${diner}`, items: cart }, diner)).orderId;
    ticketId = `${orderId}__v-rm`;
  });

  const rm = { role: 'vendorStaff', vendorId: 'v-rm' };

  it('only lets the right staff move a ticket', async () => {
    await expect(call(vendorAction, { subOrderId: ticketId, action: 'ACCEPT' }, diner)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call(vendorAction, { subOrderId: ticketId, action: 'ACCEPT' }, uniqueUid('staff'), { role: 'vendorStaff', vendorId: 'v-sv' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call(vendorAction, { subOrderId: ticketId, action: 'CANCEL', reason: 'test' }, uniqueUid('staff'), rm)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('walks accept → ready → undo → ready → collected through the status machine', async () => {
    const staff = uniqueUid('staff');
    expect((await call(vendorAction, { subOrderId: ticketId, action: 'ACCEPT' }, staff, rm)).status).toBe('PREPARING');
    await expect(call(vendorAction, { subOrderId: ticketId, action: 'ACCEPT' }, staff, rm)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect((await call(vendorAction, { subOrderId: ticketId, action: 'READY' }, staff, rm)).status).toBe('READY');
    expect((await call(vendorAction, { subOrderId: ticketId, action: 'UNDO_READY' }, staff, rm)).status).toBe('PREPARING');
    await call(vendorAction, { subOrderId: ticketId, action: 'READY' }, staff, rm);
    expect((await call(vendorAction, { subOrderId: ticketId, action: 'COLLECTED' }, staff, rm)).status).toBe('COLLECTED');
    const t = (await db.doc(`subOrders/${ticketId}`).get()).data()!;
    expect(t.ts.accepted).toBeTypeOf('number');
    expect(t.ts.collected).toBeTypeOf('number');
    expect((await db.doc(`pointsLedger/earn_${ticketId}`).get()).exists).toBe(true);
  });

  it('lets the master cancel, and requires a reason', async () => {
    const master = uniqueUid('master');
    await expect(call(vendorAction, { subOrderId: ticketId, action: 'CANCEL' }, master, { role: 'master' })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await call(vendorAction, { subOrderId: ticketId, action: 'CANCEL', reason: 'Kitchen fire drill' }, master, { role: 'master' })).status).toBe('CANCELLED');
  });

  it('times out tickets nobody accepted', async () => {
    await db.doc(`subOrders/${ticketId}`).update({ 'ts.placed': Date.now() - 10 * 60_000 });
    expect(await timeOutUnaccepted()).toBe(1);
    expect((await db.doc(`subOrders/${ticketId}`).get()).data()!.status).toBe('TIMED_OUT');
  });

  it('refunds online-paid tickets proportionally and skips counter orders', async () => {
    // A counter order took no online money: rejecting it records that nothing is owed, in the same write.
    await call(vendorAction, { subOrderId: ticketId, action: 'REJECT', reason: 'Sold out' }, uniqueUid('staff'), rm);
    expect((await db.doc(`subOrders/${ticketId}`).get()).data()!.refund).toMatchObject({ status: 'NOT_REQUIRED', amountPaise: 0 });
    expect(await processRefund(ticketId)).toBe('not-required');

    await db.doc(`orders/${orderId}`).update({ 'payment.mode': 'ONLINE', 'payment.status': 'SUCCESS', 'payment.rzpPaymentId': 'pay_ref1' });
    await db.doc(`subOrders/${ticketId}`).update({ refund: { status: 'REQUIRED', amountPaise: 0 } });
    const calls = fakeRazorpay({ refund: (_u, body) => ({ json: { id: 'rfnd_1', amount: body.amount, receipt: body.receipt, status: 'pending' } }) });
    expect(await processRefund(ticketId)).toBe('claimed');
    expect(calls[0]!.url).toBe('https://api.razorpay.com/v1/payments/pay_ref1/refund');
    expect(calls[0]!.body.amount).toBe(24000);
    expect(calls[0]!.headers['X-Refund-Idempotency']).toBe(`rf_${ticketId}`.slice(0, 40));
    const t = (await db.doc(`subOrders/${ticketId}`).get()).data()!;
    expect(t.refund).toMatchObject({ status: 'PENDING', amountPaise: 24000, refundId: `rf_${ticketId}`.slice(0, 40), gatewayRefundId: 'rfnd_1' });
  });

  it('accepts issue reports only for your own order', async () => {
    await expect(call(reportIssue, { orderId, reason: 'missing_item' }, uniqueUid())).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await call(reportIssue, { orderId, subOrderId: ticketId, reason: 'missing_item', text: 'No chutney' }, diner)).issueId).toBeTruthy();
  });
});

describe('adminAction', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: false });
    await db.doc('tables/tbl-15').set({ code: 'T15', label: 'T-15', zone: 'Main', active: true });
  });

  it('is master-only and issues unguessable tokens', async () => {
    await expect(call(adminAction, { action: 'ENSURE_QR_TOKENS' }, uniqueUid(), { role: 'vendorAdmin', vendorId: 'v-rm' })).rejects.toMatchObject({ code: 'permission-denied' });
    const res = await call(adminAction, { action: 'ENSURE_QR_TOKENS' }, uniqueUid('master'), { role: 'master' });
    expect(res.updated).toBe(1);
    const token = (await db.doc('tables/tbl-15').get()).data()!.qrToken as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const rotated = await call(adminAction, { action: 'ROTATE_QR', tableId: 'tbl-14' }, uniqueUid('master'), { role: 'master' });
    expect(rotated.qrToken).not.toBe(QR);
    await expect(call(startSession, { qrToken: QR }, uniqueUid())).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('one table, many phones', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: false });
  });

  it('lets a new phone order at a table while an earlier order there is still cooking', async () => {
    const first = uniqueUid();
    const firstSession = await sessionFor(startSession, first);
    const a = await call(createCheckout, { sessionId: firstSession, checkoutKey: 'table-key-01', items: cart }, first);
    await call(vendorAction, { subOrderId: `${a.orderId}__v-rm`, action: 'ACCEPT' }, 'staff-rm', { role: 'vendorStaff', vendorId: 'v-rm' });

    // Two more groups sit at the same table a minute later, each on their own phone.
    const second = uniqueUid();
    const third = uniqueUid();
    const s2 = await call(startSession, { qrToken: QR }, second);
    const s3 = await call(startSession, { qrToken: QR }, third);
    expect(new Set([firstSession, s2.sessionId, s3.sessionId]).size).toBe(3);
    expect(s2.tableLabel).toBe('T-14');

    const b = await call(createCheckout, { sessionId: s2.sessionId, checkoutKey: 'table-key-02', items: cart }, second);
    const c = await call(createCheckout, { sessionId: s3.sessionId, checkoutKey: 'table-key-03', items: cart }, third);
    expect(new Set([a.orderId, b.orderId, c.orderId]).size).toBe(3);

    // Separate tokens per order, so nobody collects another group's food.
    const tokens = await Promise.all([a, b, c].map(async (o) => (await db.doc(`subOrders/${o.orderId}__v-rm`).get()).data()!.token));
    expect(new Set(tokens).size).toBe(3);
    expect((await db.doc(`subOrders/${a.orderId}__v-rm`).get()).data()!.status).toBe('PREPARING');

    // And one phone cannot order on another phone's table session.
    await expect(call(createCheckout, { sessionId: firstSession, checkoutKey: 'table-key-04', items: cart }, second)).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
