import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import { startSession } from '../src/callable/startSession';
import { createCheckout } from '../src/callable/createCheckout';
import { vendorAction } from '../src/callable/vendorAction';
import { reconcilePayments, timeOutUnaccepted } from '../src/scheduled/sweeper';
import { syncParentStatus } from '../src/lib/orders';
import { call, fakeCashfree, resetDb, seed, sessionFor, uniqueUid } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const cart = [
  { itemId: 'rm-1', vendorId: 'v-rm', name: 'Paneer Roll', pricePaise: 1, veg: true, qty: 1 },
  { itemId: 'sv-1', vendorId: 'v-sv', name: 'Masala Dosa', pricePaise: 1, veg: true, qty: 1 },
];

describe('the sweeper stays cheap', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: true });
  });

  it('does not read any shop when no ticket is waiting', async () => {
    const reads: string[] = [];
    const spy = vi.spyOn(db, 'collection').mockImplementation(((path: string) => {
      reads.push(path);
      return (spy.getMockImplementation() as never, Object.getPrototypeOf(db).collection.call(db, path));
    }) as never);
    expect(await timeOutUnaccepted()).toBe(0);
    spy.mockRestore();
    expect(reads).toEqual(['subOrders']);
  });

  it('asks Cashfree about an unpaid order at its check ages, not every minute', async () => {
    const uid = uniqueUid();
    const sessionId = await sessionFor(startSession, uid);
    fakeCashfree({ createOrder: (_u, body) => ({ json: { order_id: body.order_id, payment_session_id: 'ps', cf_order_id: 1, order_status: 'ACTIVE' } }) });
    const { orderId } = await call(createCheckout, { sessionId, checkoutKey: 'cost-key-1', items: cart, customerPhone: '9123456780' }, uid);
    const asked: string[] = [];
    const calls = fakeCashfree({ getOrder: () => ({ json: { order_id: orderId, order_status: 'ACTIVE', order_amount: 1, order_currency: 'INR' } }) });
    const ageAt = async (min: number) => {
      await db.doc(`orders/${orderId}`).update({ createdAt: Date.now() - min * 60_000 - 1000 });
      const before = calls.length;
      await reconcilePayments();
      asked.push(`${min}:${calls.length - before}`);
    };
    for (const min of [3, 4, 5, 6, 7, 8, 9, 12, 13]) await ageAt(min);
    expect(asked).toEqual(['3:1', '4:0', '5:1', '6:0', '7:0', '8:1', '9:0', '12:1', '13:0']);
  });

  it('still expires an unpaid order that has outlived its window', async () => {
    const uid = uniqueUid();
    const sessionId = await sessionFor(startSession, uid);
    fakeCashfree({ createOrder: (_u, body) => ({ json: { order_id: body.order_id, payment_session_id: 'ps', cf_order_id: 1, order_status: 'ACTIVE' } }) });
    const { orderId } = await call(createCheckout, { sessionId, checkoutKey: 'cost-key-2', items: cart, customerPhone: '9123456780' }, uid);
    fakeCashfree({ getOrder: () => ({ json: { order_id: orderId, order_status: 'ACTIVE', order_amount: 1, order_currency: 'INR' } }) });
    await db.doc(`orders/${orderId}`).update({ createdAt: Date.now() - 45 * 60_000, expiresAt: Date.now() - 30 * 60_000 });
    expect((await reconcilePayments()).expired).toBe(1);
    expect((await db.doc(`orders/${orderId}`).get()).data()!.status).toBe('EXPIRED');
  });
});

describe('kitchen steps and order status', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: false });
  });

  it('leaves the order untouched when a ticket step does not change its overall status', async () => {
    const uid = uniqueUid();
    const sessionId = await sessionFor(startSession, uid);
    const { orderId } = await call(createCheckout, { sessionId, checkoutKey: 'cost-key-3', items: cart }, uid);
    await syncParentStatus(orderId);
    const before = (await db.doc(`orders/${orderId}`).get()).data()!;
    await new Promise((r) => setTimeout(r, 5));
    await syncParentStatus(orderId);
    expect((await db.doc(`orders/${orderId}`).get()).data()!.updatedAt).toBe(before.updatedAt);
  });

  it('keeps working without the shared limiter and still stops a runaway kitchen tablet', async () => {
    const uid = uniqueUid();
    const sessionId = await sessionFor(startSession, uid);
    const { orderId } = await call(createCheckout, { sessionId, checkoutKey: 'cost-key-4', items: cart }, uid);
    const staff = uniqueUid('staff');
    const rm = { role: 'vendorStaff', vendorId: 'v-rm' };
    expect((await call(vendorAction, { subOrderId: `${orderId}__v-rm`, action: 'ACCEPT' }, staff, rm)).status).toBe('PREPARING');
    expect((await db.collection('rateLimits').get()).docs.some((d) => d.id.startsWith('vendor'))).toBe(false);
    let blocked = false;
    for (let i = 0; i < 405 && !blocked; i++) {
      blocked = await call(vendorAction, { subOrderId: `${orderId}__v-rm`, action: 'ACCEPT' }, staff, rm).then(() => false, (e) => e.code === 'resource-exhausted');
    }
    expect(blocked).toBe(true);
  });

  it('skips the order re-check on steps that cannot change it, and still completes the order when all is collected', async () => {
    const uid = uniqueUid();
    const sessionId = await sessionFor(startSession, uid);
    const { orderId } = await call(createCheckout, { sessionId, checkoutKey: 'cost-key-5', items: cart }, uid);
    const rm = { role: 'vendorStaff', vendorId: 'v-rm' };
    const sv = { role: 'vendorStaff', vendorId: 'v-sv' };
    const staff = uniqueUid('staff');
    const stamp = async () => (await db.doc(`orders/${orderId}`).get()).data()!;
    const before = await stamp();
    await call(vendorAction, { subOrderId: `${orderId}__v-rm`, action: 'ACCEPT' }, staff, rm);
    await call(vendorAction, { subOrderId: `${orderId}__v-rm`, action: 'READY' }, staff, rm);
    expect((await stamp()).updatedAt).toBe(before.updatedAt);
    await call(vendorAction, { subOrderId: `${orderId}__v-rm`, action: 'COLLECTED' }, staff, rm);
    expect((await stamp()).status).not.toBe('COMPLETED');
    for (const step of ['ACCEPT', 'READY', 'COLLECTED']) await call(vendorAction, { subOrderId: `${orderId}__v-sv`, action: step }, staff, sv);
    expect((await stamp()).status).toBe('COMPLETED');
  });
});

describe('no payment gate, no free-for-all', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: false });
  });

  const tooMany = (p: Promise<unknown>) => p.then(() => false, (e) => e.code === 'resource-exhausted');

  it('gives one table session three counter orders per quarter hour, and leaves other sessions alone', async () => {
    const uid = uniqueUid();
    const sessionId = await sessionFor(startSession, uid);
    for (const n of [1, 2, 3]) expect((await call(createCheckout, { sessionId, checkoutKey: `prank-key-${n}`, items: cart }, uid)).status).toBe('PAID');
    expect(await tooMany(call(createCheckout, { sessionId, checkoutKey: 'prank-key-4', items: cart }, uid))).toBe(true);
    // Retrying an order that already went through is not counted against the allowance.
    expect((await call(createCheckout, { sessionId, checkoutKey: 'prank-key-1', items: cart }, uid)).status).toBe('PAID');
    const other = uniqueUid();
    const otherSession = await sessionFor(startSession, other);
    expect((await call(createCheckout, { sessionId: otherSession, checkoutKey: 'fair-key-1', items: cart }, other)).status).toBe('PAID');
  });

  it('caps a whole table, however many accounts the orders come from', async () => {
    let placed = 0;
    let blocked = false;
    for (let i = 0; i < 31 && !blocked; i++) {
      const uid = uniqueUid();
      const sessionId = await sessionFor(startSession, uid);
      blocked = await tooMany(call(createCheckout, { sessionId, checkoutKey: `table-key-${i}-aaaa`, items: cart }, uid));
      if (!blocked) placed++;
    }
    expect(placed).toBe(30);
    expect(blocked).toBe(true);
  });
});

describe('online checkout allowance', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: true });
  });

  it('stops an account from creating a seventh gateway order in ten minutes', async () => {
    const uid = uniqueUid();
    const sessionId = await sessionFor(startSession, uid);
    fakeCashfree({ createOrder: (_u, body) => ({ json: { order_id: body.order_id, payment_session_id: 'ps', cf_order_id: 1, order_status: 'ACTIVE' } }) });
    for (let n = 1; n <= 6; n++) await call(createCheckout, { sessionId, checkoutKey: `flood-key-${n}-aaaa`, items: cart }, uid);
    await expect(call(createCheckout, { sessionId, checkoutKey: 'flood-key-7-aaaa', items: cart }, uid)).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
});

