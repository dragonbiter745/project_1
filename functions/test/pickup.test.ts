import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import { startSession } from '../src/callable/startSession';
import { createCheckout } from '../src/callable/createCheckout';
import { call, fakeCashfree, resetDb, seed, uniqueUid } from './helpers';

const member = (provider = 'password') => ({ firebase: { sign_in_provider: provider }, email: 'diner@example.test', name: 'Ananya Rao' });
const guest = { firebase: { sign_in_provider: 'anonymous' } };
const cart = [{ itemId: 'rm-1', vendorId: 'v-rm', name: 'Paneer Roll', pricePaise: 1, veg: true, qty: 1 }];

describe('pickup orders from the website', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a pickup session for guests and signed-in diners, but not for nobody', async () => {
    await expect(call(startSession, { mode: 'pickup' })).rejects.toMatchObject({ code: 'unauthenticated' });

    // A guest gets a session and a generated name, never a blank one.
    const guestUid = uniqueUid();
    const g = await call(startSession, { mode: 'pickup' }, guestUid, guest);
    expect(g).toMatchObject({ tableId: 'pickup', tableLabel: 'Pickup', dailyNo: 1 });
    expect(g.displayName).toBeTruthy();
    expect((await db.doc(`users/${guestUid}`).get()).exists).toBe(false); // no account was created

    const uid = uniqueUid();
    const first = await call(startSession, { mode: 'pickup' }, uid, member());
    expect(first).toMatchObject({ tableId: 'pickup', tableLabel: 'Pickup', dailyNo: 2 }); // the guest above took 1
    const stored = (await db.doc(`sessions/${first.sessionId}`).get()).data()!;
    expect(stored).toMatchObject({ uid, tableId: 'pickup' });
    expect(stored.qrToken).toBeUndefined();

    // The same diner the same day resumes the same session; Google accounts work too.
    const again = await call(startSession, { mode: 'pickup' }, uid, member());
    expect(again.sessionId).toBe(first.sessionId);
    const other = await call(startSession, { mode: 'pickup' }, uniqueUid(), member('google.com'));
    expect(other.dailyNo).toBe(3);
  });

  it('still refuses a bad table token', async () => {
    await expect(call(startSession, { qrToken: 'nope' }, uniqueUid(), member())).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call(startSession, { mode: 'table' }, uniqueUid(), member())).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('takes a paid order and sends the diner back to the website after payment', async () => {
    const calls = fakeCashfree({ createOrder: (_u, body) => ({ json: { order_id: body.order_id, payment_session_id: 'ps_test', cf_order_id: 1, order_status: 'ACTIVE' } }) });
    const uid = uniqueUid();
    const { sessionId } = await call(startSession, { mode: 'pickup' }, uid, member());
    const res = await call(createCheckout, { sessionId, checkoutKey: 'pickup-key-1', items: cart, customerPhone: '9876543210' }, uid, member());
    expect(res).toMatchObject({ status: 'PENDING_PAYMENT', paymentSessionId: 'ps_test', totalPaise: 12000 });
    const order = (await db.doc(`orders/${res.orderId}`).get()).data()!;
    expect(order).toMatchObject({ tableId: 'pickup', tableLabel: 'Pickup', uid });
    expect(calls[0]!.body.order_meta.return_url).toBe('https://order.example.test/order?order_id={order_id}');

    // Idempotent: the same key maps to the same order.
    const retry = await call(createCheckout, { sessionId, checkoutKey: 'pickup-key-1', items: cart, customerPhone: '9876543210' }, uid, member());
    expect(retry.orderId).toBe(res.orderId);
  });

  it('refuses pickup orders when online payments are off', async () => {
    const uid = uniqueUid();
    const { sessionId } = await call(startSession, { mode: 'pickup' }, uid, member());
    await db.doc('config/global').update({ 'flags.paymentsEnabled': false });
    await expect(call(createCheckout, { sessionId, checkoutKey: 'pickup-key-2', items: cart }, uid, member())).rejects.toMatchObject({ code: 'failed-precondition' });
    const orders = await db.collection('orders').where('uid', '==', uid).get();
    expect(orders.empty).toBe(true);
  });

  it('lets a guest pay for a pickup order without an account or a phone number', async () => {
    const calls = fakeCashfree({ createOrder: (_u, body) => ({ json: { order_id: body.order_id, payment_session_id: 'ps_guest', cf_order_id: 2, order_status: 'ACTIVE' } }) });
    const uid = uniqueUid();
    const { sessionId } = await call(startSession, { mode: 'pickup' }, uid, guest);
    const res = await call(createCheckout, { sessionId, checkoutKey: 'pickup-key-3', items: cart }, uid, guest);
    expect(res).toMatchObject({ status: 'PENDING_PAYMENT', paymentSessionId: 'ps_guest', totalPaise: 12000 });
    const order = (await db.doc(`orders/${res.orderId}`).get()).data()!;
    expect(order).toMatchObject({ tableId: 'pickup', uid });
    expect(calls[0]!.body.customer_details.customer_phone).toBe('9999999999'); // the stand-in number
  });

  it("refuses someone else's pickup session, guest or not", async () => {
    const owner = uniqueUid();
    const { sessionId } = await call(startSession, { mode: 'pickup' }, owner, guest);
    await expect(call(createCheckout, { sessionId, checkoutKey: 'pickup-key-4', items: cart }, uniqueUid(), guest)).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('still refuses a guest pickup order while online payments are off', async () => {
    const uid = uniqueUid();
    const { sessionId } = await call(startSession, { mode: 'pickup' }, uid, guest);
    await db.doc('config/global').update({ 'flags.paymentsEnabled': false });
    await expect(call(createCheckout, { sessionId, checkoutKey: 'pickup-key-5', items: cart }, uid, guest)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect((await db.collection('orders').where('uid', '==', uid).get()).empty).toBe(true);
  });
});
