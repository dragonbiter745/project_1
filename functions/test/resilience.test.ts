import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getIstDateKey } from '@foodcourt/shared';
import { db } from '../src/db';
import { startSession } from '../src/callable/startSession';
import { createCheckout } from '../src/callable/createCheckout';
import { razorpayWebhook } from '../src/webhook/razorpayWebhook';
import { reconcilePayments } from '../src/scheduled/sweeper';
import { istDayRange, reconcileDay } from '../src/scheduled/dailyReconcile';
import { call, fakeRazorpay, resetDb, seed, sessionFor, sign, uniqueUid, webhookCall } from './helpers';

const cart = [{ itemId: 'rm-1', vendorId: 'v-rm', name: 'Paneer Roll', pricePaise: 1, veg: true, qty: 1 }];
const TOTAL = 12000;
const dateKey = getIstDateKey();
const nowSec = () => Math.floor(Date.now() / 1000);

afterEach(() => vi.unstubAllGlobals());

async function newOrder(rzpOrderId: string): Promise<string> {
  const uid = uniqueUid();
  const sessionId = await sessionFor(startSession, uid);
  fakeRazorpay({ createOrder: (_u, body) => ({ json: { id: rzpOrderId, amount: body.amount, currency: 'INR', receipt: body.receipt, status: 'created' } }) });
  const { orderId } = await call(createCheckout, { sessionId, checkoutKey: `res-${rzpOrderId}`, items: cart, customerPhone: '9123456780' }, uid);
  vi.unstubAllGlobals();
  return orderId;
}
const pay = (id: string, order_id: string, amount = TOTAL, status = 'captured') => ({ id, order_id, amount, currency: 'INR', status, method: 'upi', created_at: nowSec() });
const gateway = (items: unknown[]) => fakeRazorpay({ getOrder: () => ({ json: { items } }) });

describe('payment event ledger', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: true });
  });
  const body = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_L1', order_id: 'order_L1', amount: TOTAL, currency: 'INR', method: 'upi', contact: '+919999999999', email: 'a@b.test' } } } };
  const send = (headers: Record<string, string> = {}) => webhookCall(razorpayWebhook as any, body, { 'x-razorpay-signature': sign(JSON.stringify(body)), ...headers });

  it('records each verified event once, counts redeliveries, and keeps no personal data', async () => {
    await newOrder('order_L1');
    await send({ 'x-razorpay-event-id': 'evt_1' });
    await send({ 'x-razorpay-event-id': 'evt_1' });
    await send({ 'x-razorpay-event-id': 'evt_1' });
    const all = await db.collection('paymentEvents').get();
    expect(all.size).toBe(1);
    const e = all.docs[0]!.data();
    expect(e).toMatchObject({ eventId: 'evt_1', event: 'payment.captured', rzpOrderId: 'order_L1', rzpPaymentId: 'pay_L1', amountPaise: TOTAL, deliveries: 3, outcome: 'already' });
    expect(JSON.stringify(e)).not.toMatch(/9999999999|a@b\.test/);
  });

  it('never records a forged request', async () => {
    const r = await webhookCall(razorpayWebhook as any, body, { 'x-razorpay-signature': 'forged' });
    expect(r.status).toBe(401);
    expect((await db.collection('paymentEvents').get()).empty).toBe(true);
  });

  it('falls back to a hash of the body when no event id header is sent', async () => {
    await newOrder('order_L1');
    await send();
    await send();
    expect((await db.collection('paymentEvents').get()).size).toBe(1);
  });
});

describe('nightly reconciliation against Razorpay', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: true });
  });

  it('reports a clean day when both sides agree', async () => {
    const id = await newOrder('order_R1');
    await db.doc(`orders/${id}`).update({ status: 'PAID', 'payment.status': 'SUCCESS', 'payment.rzpPaymentId': 'pay_R1' });
    gateway([pay('pay_R1', 'order_R1')]);
    const r = await reconcileDay(dateKey);
    expect(r).toMatchObject({ ok: true, gatewayCount: 1, gatewayPaise: TOTAL, bookCount: 1, bookPaise: TOTAL, discrepancies: 0, healed: 0 });
    expect((await db.doc(`reconciliationReports/${dateKey}`).get()).data()!.ok).toBe(true);
  });

  it('settles a payment Razorpay took but whose webhook never arrived', async () => {
    const id = await newOrder('order_R2');
    gateway([pay('pay_R2', 'order_R2')]);
    const r = await reconcileDay(dateKey);
    expect(r.healed).toBe(1);
    expect((await db.doc(`orders/${id}`).get()).data()).toMatchObject({ status: 'PAID', payment: { rzpPaymentId: 'pay_R2' } });
    expect((await db.collection('subOrders').where('orderId', '==', id).get()).size).toBe(1);
  });

  it('flags money marked paid here that Razorpay never received', async () => {
    const id = await newOrder('order_R3');
    await db.doc(`orders/${id}`).update({ status: 'PAID', 'payment.status': 'SUCCESS', 'payment.rzpPaymentId': 'pay_ghost' });
    gateway([]);
    const r = await reconcileDay(dateKey);
    expect(r.ok).toBe(false);
    expect(r.samples).toEqual([expect.objectContaining({ kind: 'in-books-not-at-gateway', orderId: id, rzpPaymentId: 'pay_ghost' })]);
  });

  it('flags a different amount and never fulfils it', async () => {
    const id = await newOrder('order_R4');
    gateway([pay('pay_R4', 'order_R4', 100)]);
    const r = await reconcileDay(dateKey);
    expect(r.samples[0]).toMatchObject({ kind: 'amount-differs', gatewayPaise: 100, bookPaise: TOTAL });
    // Never fulfilled: closed, flagged, and the wrong amount is owed back in full.
    const o = (await db.doc(`orders/${id}`).get()).data()!;
    expect(o.status).toBe('FAILED');
    expect(o.payment.status).toBe('FLAGGED');
    expect(o.lateRefund).toMatchObject({ reason: 'amount-mismatch', amountPaise: 100, paymentId: 'pay_R4' });
    expect((await db.collection('subOrders').get()).size).toBe(0);
  });

  it('reports a gateway payment we have no order for, and ignores refunded/failed correctly', async () => {
    gateway([pay('pay_X', 'order_unknown'), pay('pay_F', 'order_unknown2', TOTAL, 'failed')]);
    const r = await reconcileDay(dateKey);
    expect(r.samples.map((s) => s.kind)).toEqual(['unknown-gateway-payment']);
  });

  it('judges only payments created inside the IST day', async () => {
    const { fromSec } = istDayRange(dateKey);
    gateway([{ ...pay('pay_old', 'order_unknown'), created_at: fromSec - 600 }]);
    expect((await reconcileDay(dateKey)).discrepancies).toBe(0);
  });
});

describe('sweeper at lunch-rush volume', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: true });
  });

  it('looks at the oldest unpaid orders first and handles far more than 100 at once', async () => {
    const now = Date.now();
    const batch = db.batch();
    for (let i = 0; i < 450; i++) {
      batch.set(db.doc(`orders/rush${String(i).padStart(3, '0')}`), {
        status: 'PENDING_PAYMENT', createdAt: now - 60 * 60_000 - i * 1000, expiresAt: now - 30 * 60_000,
        totals: { totalPaise: TOTAL, subtotalPaise: TOTAL }, payment: { status: 'PENDING', mode: 'ONLINE', rzpOrderId: `order_rush${i}` },
      });
    }
    await batch.commit();
    fakeRazorpay({ orderPayments: () => ({ json: { items: [] } }) });
    const r = await reconcilePayments(now);
    expect(r.expired).toBe(450); // an old cap of 100 would have left 350 unpaid orders open
    expect((await db.collection('orders').where('status', '==', 'PENDING_PAYMENT').get()).size).toBe(0);
  });
});
