import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { deriveParentOrderStatus } from '@foodcourt/shared';
import { db } from '../src/db';
import { startSession } from '../src/callable/startSession';
import { createCheckout } from '../src/callable/createCheckout';
import { vendorAction } from '../src/callable/vendorAction';
import { financeAction } from '../src/callable/finance';
import { moneyHealth } from '../src/callable/moneyHealth';
import { closeYesterday, pauseIfUnattended, sweep } from '../src/scheduled/sweeper';
import { summarise } from '../src/scheduled/settlementReconcile';
import { reconcileDay } from '../src/scheduled/dailyReconcile';
import { holdCoupon } from '../src/lib/coupons';
import { processRefund } from '../src/lib/refunds';
import { clientIp } from '../src/lib/guard';
import { call, fakeRazorpay, resetDb, seed, sessionFor, uniqueUid } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const cart = [{ itemId: 'rm-1', vendorId: 'v-rm', name: 'Paneer Roll', pricePaise: 1, veg: true, qty: 1 }];
const master = { role: 'master' };
const rm = { role: 'vendorStaff', vendorId: 'v-rm' };
const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

describe('kitchen screen heartbeat and auto-pause', () => {
  let uid = '';
  let sessionId = '';
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: false });
    uid = uniqueUid();
    sessionId = await sessionFor(startSession, uid);
  });

  it('refuses a shop whose kitchen screen has gone quiet, and only once it has ever run one', async () => {
    // Never ran a screen: not checked (shops are not blocked before they start using the kitchen app).
    expect((await call(createCheckout, { sessionId, checkoutKey: 'beat-key-0001', items: cart }, uid)).status).toBe('PAID');
    await db.doc('presence/v-rm').set({ vendorId: 'v-rm', at: Timestamp.fromMillis(Date.now() - 10 * 60_000) });
    await expect(call(createCheckout, { sessionId, checkoutKey: 'beat-key-0002', items: [{ ...cart[0]!, qty: 2 }] }, uid)).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/not taking orders/) });
    await db.doc('presence/v-rm').set({ vendorId: 'v-rm', at: Timestamp.now() });
    expect((await call(createCheckout, { sessionId, checkoutKey: 'beat-key-0003', items: [{ ...cart[0]!, qty: 3 }] }, uid)).status).toBe('PAID');
  });

  it('pauses a shop after two tickets in a row time out, once, and raises an issue', async () => {
    const day = today();
    for (const [id, placed] of [['t1', 1000], ['t2', 2000]] as const) {
      await db.doc(`subOrders/${id}`).set({ vendorId: 'v-rm', dateKey: day, status: 'TIMED_OUT', orderId: id, ts: { placed: Date.now() - placed } });
    }
    expect(await pauseIfUnattended('v-rm')).toBe(true);
    const v = (await db.doc('vendors/v-rm').get()).data()!;
    expect(v.acceptingOrders).toBe(false);
    expect(v.autoPausedAt).toBeTypeOf('number');
    expect((await db.collection('issues').where('reason', '==', 'shop_unattended').get()).size).toBe(1);
    expect(await pauseIfUnattended('v-rm')).toBe(false);
    expect((await db.collection('issues').where('reason', '==', 'shop_unattended').get()).size).toBe(1);
  });

  it('does not pause a shop whose latest ticket was accepted', async () => {
    const day = today();
    await db.doc('subOrders/a1').set({ vendorId: 'v-rm', dateKey: day, status: 'TIMED_OUT', orderId: 'a1', ts: { placed: Date.now() - 5000 } });
    await db.doc('subOrders/a2').set({ vendorId: 'v-rm', dateKey: day, status: 'PREPARING', orderId: 'a2', ts: { placed: Date.now() - 1000 } });
    expect(await pauseIfUnattended('v-rm')).toBe(false);
    expect((await db.doc('vendors/v-rm').get()).data()!.acceptingOrders).toBe(true);
  });
});

describe("kitchen: can't make it after accepting, and the nightly close", () => {
  let ticketId = '';
  let orderId = '';
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: false });
    const uid = uniqueUid();
    const sessionId = await sessionFor(startSession, uid);
    orderId = (await call(createCheckout, { sessionId, checkoutKey: `kc-${uid}`, items: cart }, uid)).orderId;
    ticketId = `${orderId}__v-rm`;
  });

  it('lets the kitchen give up on an accepted ticket (refund recorded, audited) but not a ready one', async () => {
    const staff = uniqueUid('staff');
    await call(vendorAction, { subOrderId: ticketId, action: 'ACCEPT' }, staff, rm);
    expect((await call(vendorAction, { subOrderId: ticketId, action: 'CANCEL', reason: 'Out of paneer' }, staff, rm)).status).toBe('CANCELLED');
    const t = (await db.doc(`subOrders/${ticketId}`).get()).data()!;
    expect(t.refund).toMatchObject({ status: 'NOT_REQUIRED' }); // a counter order took no online money
    expect((await db.collection('auditLogs').where('subOrderId', '==', ticketId).get()).size).toBe(1);
    // Everything failed: the order says "refunded", not "part refunded".
    expect((await db.doc(`orders/${orderId}`).get()).data()!.status).toBe('REFUNDED');
  });

  it('keeps a ready ticket for the manager to cancel', async () => {
    const staff = uniqueUid('staff');
    await call(vendorAction, { subOrderId: ticketId, action: 'ACCEPT' }, staff, rm);
    await call(vendorAction, { subOrderId: ticketId, action: 'READY' }, staff, rm);
    await expect(call(vendorAction, { subOrderId: ticketId, action: 'CANCEL', reason: 'Burnt' }, staff, rm)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it("closes yesterday's ready tickets as collected and flags ones still cooking, once", async () => {
    await db.doc(`subOrders/${ticketId}`).update({ status: 'READY', dateKey: '2026-01-01' });
    await db.doc('subOrders/stuck').set({ orderId: 'ox', vendorId: 'v-rm', vendorName: 'Roll Me', token: 'RM-9', dateKey: '2026-01-01', status: 'PREPARING', ts: { placed: 1 } });
    expect(await closeYesterday()).toEqual({ closed: 1, flagged: 1 });
    const t = (await db.doc(`subOrders/${ticketId}`).get()).data()!;
    expect(t).toMatchObject({ status: 'COLLECTED', autoClosed: true });
    expect((await db.doc(`orders/${orderId}`).get()).data()!.status).toBe('COMPLETED');
    expect((await db.doc('issues/stuck_stuck').get()).data()).toMatchObject({ reason: 'ticket_stuck', status: 'open' });
    expect(await closeYesterday()).toEqual({ closed: 0, flagged: 0 });
  });

  it('derives REFUNDED only when every part failed', () => {
    expect(deriveParentOrderStatus([{ status: 'REJECTED' }, { status: 'TIMED_OUT' }])).toBe('REFUNDED');
    expect(deriveParentOrderStatus([{ status: 'REJECTED' }, { status: 'COLLECTED' }])).toBe('PARTIALLY_REFUNDED');
  });
});

describe('sweeper health and money health page', () => {
  beforeEach(resetDb);

  it('records each sweep for the manager console', async () => {
    await sweep();
    const h = (await db.doc('ops/sweeper').get()).data()!;
    expect(h.lastRunAt).toBeTypeOf('number');
    expect(h.lastOkAt).toBe(h.lastRunAt);
    expect(h.failedSteps).toEqual([]);
  });

  it('is for the court manager only and reports failed refunds and open money issues', async () => {
    await db.doc('subOrders/f1').set({ orderId: 'o1', vendorId: 'v-rm', vendorName: 'Roll Me', token: 'RM-1', status: 'REJECTED', refund: { status: 'FAILED', amountPaise: 500, failReason: 'no balance' } });
    await db.doc('issues/refund_f1').set({ reason: 'refund_failed', status: 'open', text: 'x', orderId: 'o1', createdAt: 1 });
    await expect(call(moneyHealth, {}, uniqueUid('staff'), rm)).rejects.toMatchObject({ code: 'permission-denied' });
    const h = await call(moneyHealth, {}, uniqueUid('boss'), master);
    expect(h.refunds.failed).toEqual([expect.objectContaining({ subOrderId: 'f1', amountPaise: 500, failReason: 'no balance' })]);
    expect(h.issues).toEqual([expect.objectContaining({ id: 'refund_f1', reason: 'refund_failed' })]);
  });

  it('lets the manager mark an issue handled, with an audit entry', async () => {
    await db.doc('issues/i1').set({ reason: 'chargeback', status: 'open', text: 'x', createdAt: 1 });
    await call(financeAction, { action: 'RESOLVE_ISSUE', issueId: 'i1', note: 'Answered in the dashboard' }, uniqueUid('boss'), master);
    expect((await db.doc('issues/i1').get()).data()).toMatchObject({ status: 'resolved', resolution: 'Answered in the dashboard' });
    expect((await db.collection('auditLogs').where('action', '==', 'RESOLVE_ISSUE').get()).size).toBe(1);
  });
});

describe('money: coupons, refunds, payouts, reconciliation', () => {
  beforeEach(resetDb);

  it('reserves a limited coupon at checkout so it cannot be over-redeemed by diners paying together', async () => {
    await db.doc('coupons/TRIO').set({ code: 'TRIO', totalLimit: 3, usedCount: 0, perCustomerLimit: 1 });
    const now = Date.now();
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => holdCoupon('TRIO', `u${i}`, `o${i}`, now + 600_000, now)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    // A reservation that lapsed frees its place.
    expect(await holdCoupon('TRIO', 'late', 'o-late', now + 600_000, now + 700_000).then(() => 'ok')).toBe('ok');
  });

  it("takes a refunded ticket's share of the coupon back off the order's coupon cost", async () => {
    await db.doc('orders/oc').set({ uid: 'u', status: 'PAID', totals: { subtotalPaise: 20000, totalPaise: 18000 }, coupon: { code: 'C', discountPaise: 2000 }, couponCostPaise: 2000, payment: { mode: 'ONLINE', status: 'SUCCESS', rzpPaymentId: 'pay_oc' } });
    await db.doc('subOrders/oc__a').set({ orderId: 'oc', vendorId: 'a', token: 'A-1', subtotalPaise: 10000, status: 'REJECTED', paymentMode: 'ONLINE', refund: { status: 'REQUIRED', amountPaise: 0 } });
    await db.doc('subOrders/oc__b').set({ orderId: 'oc', vendorId: 'b', token: 'B-1', subtotalPaise: 10000, status: 'PREPARING', paymentMode: 'ONLINE' });
    fakeRazorpay({ refund: (_u, body) => ({ json: { id: 'rf', amount: body.amount, receipt: body.receipt, status: 'processed' } }) });
    await processRefund('oc__a');
    expect((await db.doc('orders/oc').get()).data()!.couponCostPaise).toBe(1000);
  });

  it('refuses a duplicate UTR and an unexplained over-balance payout', async () => {
    await seed({ paymentsEnabled: false });
    const boss = uniqueUid('boss');
    const pay = (key: string, extra: Record<string, unknown> = {}) => call(financeAction, { action: 'RECORD_PAYOUT', requestKey: key, vendorId: 'v-rm', amountPaise: 5000, paidOn: today(), reference: 'UTR123456', ...extra }, boss, master);
    // Nothing is owed yet, so paying needs a reason.
    await expect(pay('payout-key-0001')).rejects.toMatchObject({ code: 'failed-precondition' });
    expect((await pay('payout-key-0002', { overBalanceReason: 'Advance for the festival' })).duplicate).toBe(false);
    // Same UTR again (even typed with spaces) is the same transfer.
    await expect(pay('payout-key-0003', { overBalanceReason: 'again', reference: 'utr 123456' })).rejects.toMatchObject({ code: 'already-exists' });
    expect((await db.collection('payouts').get()).size).toBe(1);
  });

  it('adds up settlement rows: fee without GST, GST, refunds, disputes and net per settlement', () => {
    const r = summarise([
      { type: 'payment', amount: 10000, fee: 236, tax: 36, credit: 9764, debit: 0, settlement_id: 's1', settlement_utr: 'UTR1', entity_id: 'pay_1' },
      { type: 'refund', amount: 2000, fee: 0, tax: 0, credit: 0, debit: 2000, settlement_id: 's1' },
      { type: 'dispute', amount: 500, credit: 0, debit: 500, settlement_id: 's2', settlement_utr: 'UTR2' },
    ]);
    expect(r.totals).toEqual({ paymentsPaise: 10000, feePaise: 200, taxPaise: 36, refundsPaise: 2000, disputesPaise: 500, adjustmentsPaise: 0, netPaise: 7264 });
    expect(r.settlements.find((s) => s.settlementId === 's1')).toMatchObject({ utr: 'UTR1', netPaise: 7764 });
  });

  it('is not ok when every payment matches but the totals do not', async () => {
    const day = today();
    await db.doc('orders/r1').set({ uid: 'u', dateKey: day, status: 'PAID', totals: { totalPaise: 12000 }, payment: { mode: 'ONLINE', status: 'SUCCESS', rzpOrderId: 'order_r1', rzpPaymentId: 'pay_r1' } });
    await db.doc('orders/r2').set({ uid: 'u', dateKey: day, status: 'PAID', totals: { totalPaise: 12000 }, payment: { mode: 'ONLINE', status: 'SUCCESS', rzpOrderId: 'order_r2', rzpPaymentId: 'pay_r1' } });
    const created = Math.floor(Date.now() / 1000) - 60;
    fakeRazorpay({ getOrder: () => ({ json: { items: [{ id: 'pay_r1', order_id: 'order_r1', amount: 12000, currency: 'INR', status: 'captured', created_at: created }] } }) });
    const report = await reconcileDay(day);
    expect(report.ok).toBe(false);
    expect(report.samples.some((s) => s.kind === 'totals-differ')).toBe(true);
  });
});

describe('rate-limit address', () => {
  it('uses the address Google appends, not one the caller made up', () => {
    expect(clientIp({ rawRequest: { headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' } } })).toBe('203.0.113.9');
    expect(clientIp({ rawRequest: { headers: { 'x-forwarded-for': '203.0.113.9' } } })).toBe('203.0.113.9');
    expect(clientIp({ rawRequest: { ip: '10.0.0.1' } })).toBe('10.0.0.1');
  });
});
