import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import { startSession } from '../src/callable/startSession';
import { createCheckout } from '../src/callable/createCheckout';
import { mergeGuest } from '../src/callable/account';
import { buildCustomerInsights, customerInsights } from '../src/callable/customers';
import { QR, call, resetDb, seed, sessionFor, uniqueUid } from './helpers';

const cart = [
  { itemId: 'rm-1', vendorId: 'v-rm', name: 'Paneer Roll', pricePaise: 1, veg: true, qty: 2 },
  { itemId: 'sv-1', vendorId: 'v-sv', name: 'Masala Dosa', pricePaise: 1, veg: true, qty: 1 },
];
const DAY = 86_400_000;

afterEach(() => vi.useRealTimers());

describe('customer analytics', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: false });
  });

  it('counts one visit per diner per day, however often they scan', async () => {
    const uid = uniqueUid();
    await call(startSession, { qrToken: QR }, uid);
    await call(startSession, { qrToken: QR }, uid);
    const c = (await db.doc(`customers/${uid}`).get()).data()!;
    expect(c).toMatchObject({ uid, visits: 1, orders: 0, spendPaise: 0, member: false });
    expect(c.firstSeenAt).toBe(c.lastSeenAt);
    const visits = await db.collection('visits').where('uid', '==', uid).get();
    expect(visits.size).toBe(1);
    expect(visits.docs[0]!.data()).toMatchObject({ first: true });
  });

  it('counts a return visit on another day as a second, non-first visit', async () => {
    const uid = uniqueUid();
    await call(startSession, { qrToken: QR }, uid);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + DAY);
    await call(startSession, { qrToken: QR }, uid);
    expect((await db.doc(`customers/${uid}`).get()).data()!.visits).toBe(2);
    const visits = await db.collection('visits').where('uid', '==', uid).get();
    expect(visits.docs.map((d) => d.data().first).sort()).toEqual([false, true]);
  });

  it('adds each confirmed order to the diner: spend, shops and menu categories', async () => {
    const uid = uniqueUid();
    const sessionId = await sessionFor(startSession, uid);
    const { orderId } = await call(createCheckout, { sessionId, checkoutKey: 'cust-key-0001', items: cart }, uid);
    // A retried checkout returns the same order and must not count it twice.
    await call(createCheckout, { sessionId, checkoutKey: 'cust-key-0001', items: cart }, uid);
    const c = (await db.doc(`customers/${uid}`).get()).data()!;
    expect(c).toMatchObject({
      orders: 1,
      spendPaise: 12000 * 2 + 7000,
      byVendor: { 'v-rm': { orders: 1, spendPaise: 24000 }, 'v-sv': { orders: 1, spendPaise: 7000 } },
      byCategory: { 'v-rm__c': { qty: 2 }, 'v-sv__c': { qty: 1 } },
    });
    const order = (await db.doc(`orders/${orderId}`).get()).data()!;
    expect(order.items[0].categoryId).toBe('c');
    const visit = (await db.collection('visits').where('uid', '==', uid).get()).docs[0]!.data();
    expect(visit.ordered).toBe(true);
  });

  it("folds a guest's visits and orders into the account they sign in to", async () => {
    const guest = uniqueUid('guest');
    const member = uniqueUid('member');
    const sessionId = await sessionFor(startSession, guest);
    await call(createCheckout, { sessionId, checkoutKey: 'cust-key-0002', items: cart.slice(0, 1) }, guest);
    await db.doc(`customers/${member}`).set({ uid: member, member: true, visits: 4, orders: 3, spendPaise: 30000, firstSeenAt: 1000, lastSeenAt: 2000, byVendor: { 'v-rm': { orders: 3, spendPaise: 30000 } } });
    await mergeGuest(guest, member);
    expect((await db.doc(`customers/${guest}`).get()).exists).toBe(false);
    expect((await db.doc(`customers/${member}`).get()).data()).toMatchObject({
      visits: 5,
      orders: 4,
      spendPaise: 54000,
      firstSeenAt: 1000,
      byVendor: { 'v-rm': { orders: 4, spendPaise: 54000 } },
    });
  });

  it('sums visitors, new visitors, repeat customers and spend for the court manager', async () => {
    const a = uniqueUid();
    const b = uniqueUid();
    const sa = await sessionFor(startSession, a);
    await sessionFor(startSession, b);
    await call(createCheckout, { sessionId: sa, checkoutKey: 'cust-key-0003', items: cart.slice(1) }, a);
    await call(createCheckout, { sessionId: sa, checkoutKey: 'cust-key-0004', items: cart.slice(1) }, a);

    const r = await buildCustomerInsights(7);
    expect(r).toMatchObject({ totalCustomers: 2, newInRange: 2, activeInRange: 2, lapsed: 0, ordered: 1, repeat: 1, totalOrders: 2, totalSpendPaise: 14000, granularity: 'day' });
    expect(r.series).toHaveLength(7);
    expect(r.series[6]).toMatchObject({ visitors: 2, newVisitors: 2, ordered: 1 });

    await expect(call(customerInsights, { days: 7 }, uniqueUid())).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call(customerInsights, { days: 12 }, 'boss', { role: 'master' })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await call(customerInsights, { days: 90 }, 'boss', { role: 'master' })).granularity).toBe('week');
  });
});
