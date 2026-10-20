import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, getIstDateKey } from '@foodcourt/shared';
import { db } from '../src/db';
import { startSession } from '../src/callable/startSession';
import { createCheckout } from '../src/callable/createCheckout';
import { buildFinanceReport, financeAction, financeReport, shopReport } from '../src/callable/finance';
import { materializePaidOrder } from '../src/lib/orders';
import { call, fakeCashfree, resetDb, seed, sessionFor, uniqueUid } from './helpers';

const finance = { role: 'master', email: 'boss@example.test' };
const rmFinance = { role: 'vendorFinance', vendorId: 'v-rm' };
const today = getIstDateKey();
const line = (itemId: string, vendorId: string, qty = 1) => ({ itemId, vendorId, name: itemId, pricePaise: 1, veg: true, qty });

async function paidOnline(items: ReturnType<typeof line>[], total: number): Promise<string> {
  const uid = uniqueUid();
  const sessionId = await sessionFor(startSession, uid);
  fakeCashfree({ createOrder: (_u, body) => ({ json: { order_id: body.order_id, payment_session_id: 'ps', order_status: 'ACTIVE' } }) });
  const { orderId } = await call(createCheckout, { sessionId, checkoutKey: `fin-${uid}`, items, customerPhone: '9123456780' }, uid);
  vi.unstubAllGlobals();
  expect(await materializePaidOrder(orderId, { amountPaise: total, cfPaymentId: 'cf1', method: 'upi' })).toBe('created');
  return orderId;
}

afterEach(() => vi.unstubAllGlobals());

describe('finance', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: true });
    await db.doc('vendors/v-rm').update({ feePct: 10, perOrderFeePaise: 0 });
  });

  it('works out what every shop earned, what the court keeps and what it still owes', async () => {
    await paidOnline([line('rm-1', 'v-rm', 2), line('sv-1', 'v-sv')], 31000);
    const rejected = await paidOnline([line('rm-2', 'v-rm')], 9000);
    // The kitchen rejected the second order; the diner is refunded in full.
    await db.doc(`subOrders/${rejected}__v-rm`).update({ status: 'REJECTED', refund: { status: 'PROCESSED', amountPaise: 9000 } });
    // One pay-at-counter order: the shop holds that money, the court is still owed its commission.
    await db.doc('config/global').update({ 'flags.paymentsEnabled': false });
    const uid = uniqueUid();
    await call(createCheckout, { sessionId: await sessionFor(startSession, uid), checkoutKey: `counter-${uid}`, items: [line('rm-1', 'v-rm')] }, uid);

    const r = await buildFinanceReport(today, today);
    expect(r).toMatchObject({ collectedPaise: 40000, paidOrders: 2, refundsPaise: 9000, netPaise: 31000, averageOrderPaise: 20000 });
    const rm = r.shops.find((s) => s.vendorId === 'v-rm')!;
    expect(rm).toMatchObject({ orders: 1, salesPaise: 24000, refundsPaise: 9000, commissionPaise: 3600, counterOrders: 1, counterSalesPaise: 12000 });
    expect(rm.payablePaise).toBe(24000 - 2400 - 1200);
    expect(rm.balanceDuePaise).toBe(20400);
    const sv = r.shops.find((s) => s.vendorId === 'v-sv')!;
    expect(sv).toMatchObject({ orders: 1, salesPaise: 7000, commissionPaise: 0, payablePaise: 7000 });

    // Today is charted by the hour, and the hours add up to the period totals.
    expect(r.granularity).toBe('hour');
    const sum = (k: 'salesPaise' | 'commissionPaise' | 'orders') => r.series.reduce((n, p) => n + p[k], 0);
    expect({ sales: sum('salesPaise'), commission: sum('commissionPaise'), orders: sum('orders') }).toEqual({ sales: 31000, commission: 3600, orders: 2 });
    // Compared with yesterday, which had nothing.
    expect(r.previous).toMatchObject({ salesPaise: 0, orders: 0, collectedPaise: 0, paidOrders: 0 });
    expect(rm.previousSalesPaise).toBe(0);
  });

  it('charts a longer range by the day and compares it with the period before', async () => {
    await paidOnline([line('rm-1', 'v-rm')], 12000);
    const week = await buildFinanceReport(addDays(today, -6), today);
    expect(week.granularity).toBe('day');
    expect(week.series).toHaveLength(7);
    expect(week.series.at(-1)).toMatchObject({ key: today, salesPaise: 12000, orders: 1 });
    expect(week.previous).toMatchObject({ from: addDays(today, -13), to: addDays(today, -7) });
    const year = await buildFinanceReport(addDays(today, -89), today);
    expect(year.granularity).toBe('week');
    expect(year.series.reduce((n, p) => n + p.salesPaise, 0)).toBe(12000);
  });

  it('records each payout once, lowers the balance, and can void a mistake', async () => {
    await paidOnline([line('rm-1', 'v-rm')], 12000);
    const staff = uniqueUid('fin');
    const payout = { action: 'RECORD_PAYOUT', requestKey: 'form-0001', vendorId: 'v-rm', amountPaise: 5000, paidOn: today, reference: 'UTR123456' };
    const first = await call(financeAction, payout, staff, finance);
    const again = await call(financeAction, payout, staff, finance);
    expect(again).toEqual({ payoutId: first.payoutId, duplicate: true });
    expect((await db.collection('payouts').get()).size).toBe(1);

    let rm = (await buildFinanceReport(today, today)).shops.find((s) => s.vendorId === 'v-rm')!;
    expect(rm).toMatchObject({ payablePaise: 10800, paidOutPaise: 5000, balanceDuePaise: 5800 });

    await call(financeAction, { action: 'VOID_PAYOUT', payoutId: first.payoutId, reason: 'Wrong shop' }, staff, finance);
    rm = (await buildFinanceReport(today, today)).shops.find((s) => s.vendorId === 'v-rm')!;
    expect(rm.balanceDuePaise).toBe(10800);
    expect((await db.doc(`payouts/${first.payoutId}`).get()).data()).toMatchObject({ status: 'VOID', voidReason: 'Wrong shop', voidedBy: 'boss@example.test' });
  });

  it('applies a new commission rate only to orders placed after the change', async () => {
    await paidOnline([line('rm-1', 'v-rm')], 12000);
    await call(financeAction, { action: 'SET_COMMISSION', vendorId: 'v-rm', feePct: 5, perOrderFeePaise: 200 }, uniqueUid('fin'), finance);
    await paidOnline([line('rm-1', 'v-rm')], 12000);
    const rm = (await buildFinanceReport(today, today)).shops.find((s) => s.vendorId === 'v-rm')!;
    expect(rm.commissionPaise).toBe(1200 + 600 + 200);
  });

  it("gives a shop's finance login its own shop only, and nothing court-wide", async () => {
    await paidOnline([line('rm-1', 'v-rm', 2), line('sv-1', 'v-sv')], 31000);
    const range = { from: today, to: today };
    const mine = await call(shopReport, { ...range, vendorId: 'v-sv' }, uniqueUid(), rmFinance);
    expect(mine).toMatchObject({ vendorId: 'v-rm', orders: 1, salesPaise: 24000, commissionPaise: 2400, payablePaise: 21600, balanceDuePaise: 21600, granularity: 'hour' });
    expect(mine.series.reduce((n: number, p: { salesPaise: number }) => n + p.salesPaise, 0)).toBe(24000);
    expect(mine).not.toHaveProperty('shops');
    await expect(call(shopReport, { ...range, vendorId: 'v-sv' }, uniqueUid(), { role: 'master' })).resolves.toMatchObject({ vendorId: 'v-sv', salesPaise: 7000 });
    await expect(call(shopReport, range, uniqueUid(), { role: 'vendorAdmin', vendorId: 'v-rm' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call(financeReport, range, uniqueUid(), rmFinance)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      call(financeAction, { action: 'RECORD_PAYOUT', requestKey: 'form-0009', vendorId: 'v-rm', amountPaise: 5000, paidOn: today, reference: 'UTR9' }, uniqueUid(), rmFinance)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call(financeAction, { action: 'SET_COMMISSION', vendorId: 'v-rm', feePct: 0, perOrderFeePaise: 0 }, uniqueUid(), rmFinance)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('keeps court figures to the court manager, and checks its input', async () => {
    const range = { from: today, to: today };
    await expect(call(financeReport, range)).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(call(financeReport, range, uniqueUid())).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call(financeReport, range, uniqueUid(), { role: 'vendorAdmin', vendorId: 'v-rm' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call(financeReport, range, uniqueUid(), { role: 'master' })).resolves.toMatchObject({ from: today });
    await expect(call(financeReport, { from: today, to: '2000-01-01' }, uniqueUid(), finance)).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      call(financeAction, { action: 'RECORD_PAYOUT', requestKey: 'form-0002', vendorId: 'v-rm', amountPaise: 5000, paidOn: '2999-01-01', reference: 'UTR1' }, uniqueUid(), finance)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call(financeAction, { action: 'SET_COMMISSION', vendorId: 'v-rm', feePct: 80, perOrderFeePaise: 0 }, uniqueUid(), finance)).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call(financeAction, { action: 'VOID_PAYOUT', payoutId: 'nope', reason: 'test' }, uniqueUid(), { role: 'vendorAdmin', vendorId: 'v-rm' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
