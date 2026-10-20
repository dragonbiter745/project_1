import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db';
import { startSession } from '../src/callable/startSession';
import { createCheckout } from '../src/callable/createCheckout';
import { accountAction, mergeGuest } from '../src/callable/account';
import { QR, call, resetDb, seed, sessionFor, uniqueUid } from './helpers';

const google = (email = 'diner@example.test', name = 'Ananya Rao') => ({ firebase: { sign_in_provider: 'google.com' }, email, name, picture: 'https://example.test/a.png' });
const guest = { firebase: { sign_in_provider: 'anonymous' } };
const cart = [{ itemId: 'rm-1', vendorId: 'v-rm', name: 'Paneer Roll', pricePaise: 1, veg: true, qty: 1 }];

describe('accountAction', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: false });
  });

  it('is for signed-in diners only', async () => {
    await expect(call(accountAction, { action: 'SYNC' })).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(call(accountAction, { action: 'SYNC' }, uniqueUid(), guest)).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('creates the profile from Google on first sign-in and keeps an edited name after', async () => {
    const uid = uniqueUid();
    const first = await call(accountAction, { action: 'SYNC' }, uid, google());
    expect(first.firstSignIn).toBe(true);
    expect(first.profile).toMatchObject({ name: 'Ananya Rao', email: 'diner@example.test' });
    const user = (await db.doc(`users/${uid}`).get()).data()!;
    expect(user).toMatchObject({ member: true, pointsBalance: 0, prefs: { orderUpdates: true } });

    await call(accountAction, { action: 'UPDATE_PROFILE', name: 'Annu', phone: '9876543210', studentId: 'r20ea123' }, uid, google());
    const again = await call(accountAction, { action: 'SYNC' }, uid, google('diner@example.test', 'Ananya R'));
    expect(again.firstSignIn).toBe(false);
    expect(again.profile).toMatchObject({ name: 'Annu', phone: '9876543210', studentId: 'R20EA123' });
  });

  it('puts the chosen name on the table session, and on the next session', async () => {
    const uid = uniqueUid();
    const sessionId = await sessionFor(startSession, uid);
    await call(accountAction, { action: 'UPDATE_PROFILE', sessionId, name: 'Kiran' }, uid, google());
    expect((await db.doc(`sessions/${sessionId}`).get()).data()!.displayName).toBe('Kiran');
    await db.doc(`sessions/${sessionId}`).delete();
    const fresh = await call(startSession, { qrToken: QR }, uid, google());
    expect(fresh.displayName).toBe('Kiran');
  });

  it('rejects bad profile input', async () => {
    const uid = uniqueUid();
    await expect(call(accountAction, { action: 'UPDATE_PROFILE', phone: '12345' }, uid, google())).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call(accountAction, { action: 'UPDATE_PROFILE', name: 'A' }, uid, google())).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call(accountAction, { action: 'DELETE_ACCOUNT', confirm: 'yes' }, uid, google())).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('saves preferences and favourites without duplicates', async () => {
    const uid = uniqueUid();
    await call(accountAction, { action: 'SET_PREFS', vegOnly: true, offers: true }, uid, google());
    await call(accountAction, { action: 'SET_PREFS', offers: false }, uid, google());
    await call(accountAction, { action: 'FAVOURITE', vendorId: 'v-sv', itemId: 'sv-1', on: true }, uid, google());
    await call(accountAction, { action: 'FAVOURITE', vendorId: 'v-rm', itemId: 'rm-1', on: true }, uid, google());
    const res = await call(accountAction, { action: 'FAVOURITE', vendorId: 'v-rm', itemId: 'rm-1', on: true }, uid, google());
    expect(res.favourites).toEqual(['v-rm:rm-1', 'v-sv:sv-1']);
    await call(accountAction, { action: 'FAVOURITE', vendorId: 'v-sv', itemId: 'sv-1', on: false }, uid, google());
    const user = (await db.doc(`users/${uid}`).get()).data()!;
    expect(user.prefs).toEqual({ vegOnly: true, offers: false });
    expect(user.favourites).toEqual(['v-rm:rm-1']);
  });

  it('deletes the profile and strips contact details from orders', async () => {
    const uid = uniqueUid();
    await call(accountAction, { action: 'SYNC' }, uid, google());
    await db.doc('orders/o-del').set({ uid, customerPhone: '9876543210', displayName: 'Ananya Rao', totals: { totalPaise: 100 } });
    await db.doc('subOrders/o-del__v-rm').set({ uid, orderId: 'o-del', vendorId: 'v-rm', customerDisplay: 'Ananya Rao' });
    await call(accountAction, { action: 'DELETE_ACCOUNT', confirm: 'DELETE' }, uid, google());
    expect((await db.doc(`users/${uid}`).get()).exists).toBe(false);
    const order = (await db.doc('orders/o-del').get()).data()!;
    expect(order.customerPhone).toBeUndefined();
    expect(order.displayName).toBe('Former diner');
    expect(order.accountDeletedAt).toBeTypeOf('number');
    expect((await db.doc('subOrders/o-del__v-rm').get()).data()!.customerDisplay).toBe('Former diner');
  });
});

describe('mergeGuest', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: false });
  });

  it("moves a guest's session, order, tickets and points into the account once", async () => {
    const from = uniqueUid('guest');
    const to = uniqueUid('member');
    const sessionId = await sessionFor(startSession, from);
    const { orderId } = await call(createCheckout, { sessionId, checkoutKey: 'merge-key-0001', items: cart }, from);
    await db.doc(`users/${from}`).set({ pointsBalance: 12, lifetimeSpendPaise: 12000 });
    await db.doc(`users/${to}`).set({ pointsBalance: 5, lifetimeSpendPaise: 5000, member: true });

    expect(await mergeGuest(from, to)).toEqual({ orders: 1 });
    expect(await mergeGuest(from, to)).toEqual({ orders: 0 });

    expect((await db.doc(`orders/${orderId}`).get()).data()).toMatchObject({ uid: to, mergedFrom: from });
    expect((await db.doc(`sessions/${sessionId}`).get()).data()!.uid).toBe(to);
    const tickets = await db.collection('subOrders').where('orderId', '==', orderId).get();
    expect(tickets.size).toBeGreaterThan(0);
    expect(tickets.docs.every((d) => d.data().uid === to)).toBe(true);
    expect((await db.doc(`users/${to}`).get()).data()).toMatchObject({ pointsBalance: 17, lifetimeSpendPaise: 17000 });
    expect((await db.doc(`users/${from}`).get()).data()).toMatchObject({ mergedInto: to, pointsBalance: 0 });

    // The account can now order from the guest's table session.
    const next = await call(createCheckout, { sessionId, checkoutKey: 'merge-key-0002', items: cart }, to);
    expect(next.status).toBe('PAID');
  });
});
