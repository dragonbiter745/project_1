import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import { claimRefund, processRefund, refundIdFor, retryRefund, settleRefund, sweepRefunds } from '../src/lib/refunds';
import { sweepStep, timeOutUnaccepted } from '../src/scheduled/sweeper';
import { razorpayWebhook } from '../src/webhook/razorpayWebhook';
import { financeAction } from '../src/callable/finance';
import { call, fakeRazorpay, resetDb, sign, uniqueUid, webhookCall } from './helpers';

afterEach(() => vi.unstubAllGlobals());

// Synthetic orders written straight to the emulator: these tests are about the refund rules, not checkout.
async function paidOrder(orderId: string, totalPaise: number, tickets: Array<{ vendorId: string; subtotalPaise: number; status?: string; refund?: unknown }>) {
  const subtotalPaise = tickets.reduce((n, t) => n + t.subtotalPaise, 0);
  await db.doc(`orders/${orderId}`).set({ uid: 'u1', status: 'PAID', dateKey: '2026-11-11', createdAt: Date.now(), items: [], totals: { subtotalPaise, totalPaise }, payment: { mode: 'ONLINE', status: 'SUCCESS', rzpPaymentId: `pay_${orderId}` } });
  for (const t of tickets) {
    await db.doc(`subOrders/${orderId}__${t.vendorId}`).set({
      orderId,
      vendorId: t.vendorId,
      uid: 'u1',
      token: `${t.vendorId.toUpperCase()}-1`,
      dateKey: '2026-11-11',
      subtotalPaise: t.subtotalPaise,
      paymentMode: 'ONLINE',
      status: t.status ?? 'REJECTED',
      ts: { placed: Date.now() },
      ...(t.refund === null ? {} : { refund: t.refund ?? { status: 'REQUIRED', amountPaise: 0 } }),
    });
  }
}
const refundOf = async (id: string) => (await db.doc(`subOrders/${id}`).get()).data()!.refund;
const accept = (status = 'pending') => fakeRazorpay({ refund: (_u, body) => ({ json: { id: `rfnd_${body.receipt}`, amount: body.amount, receipt: body.receipt, status } }) });

describe('refunds: the debt is recorded with the failure and paid exactly once', () => {
  beforeEach(resetDb);

  it('pays a refund the trigger never ran for (the sweeper finds the debt)', async () => {
    await paidOrder('o1', 20000, [{ vendorId: 'a', subtotalPaise: 20000 }]);
    const calls = accept('processed');
    expect(await sweepRefunds()).toMatchObject({ sent: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.amount).toBe(20000);
    expect(await refundOf('o1__a')).toMatchObject({ status: 'PROCESSED', amountPaise: 20000, gatewayRefundId: 'rfnd_rf_o1__a' });
  });

  it('writes the debt in the same write that times a ticket out', async () => {
    await paidOrder('o2', 9000, [{ vendorId: 'a', subtotalPaise: 9000, status: 'NEW', refund: null }]);
    await db.doc('subOrders/o2__a').update({ 'ts.placed': Date.now() - 10 * 60_000 });
    expect(await timeOutUnaccepted()).toBe(1);
    const t = (await db.doc('subOrders/o2__a').get()).data()!;
    expect(t.status).toBe('TIMED_OUT');
    expect(t.refund).toMatchObject({ status: 'REQUIRED' });
  });

  it('refunds once when the trigger, the sweeper and a retry all run', async () => {
    await paidOrder('o3', 5000, [{ vendorId: 'a', subtotalPaise: 5000 }]);
    const calls = accept();
    const states = await Promise.all([processRefund('o3__a'), processRefund('o3__a'), processRefund('o3__a')]);
    expect(states.filter((s) => s === 'claimed')).toHaveLength(1);
    await sweepRefunds();
    // Every request carries the same refund id, so Razorpay treats repeats as the same refund.
    expect(new Set(calls.filter((c) => c.method === 'POST').map((c) => c.body.receipt))).toEqual(new Set(['rf_o3__a']));
    expect(await refundOf('o3__a')).toMatchObject({ status: 'PENDING', amountPaise: 5000 });
  });

  it('never refunds more than was captured: shares round down and the last ticket takes what is left', async () => {
    // Paid 290.01 after a coupon for three shops; every shop's ticket fails.
    await paidOrder('o4', 29001, [
      { vendorId: 'a', subtotalPaise: 10000 },
      { vendorId: 'b', subtotalPaise: 10000 },
      { vendorId: 'c', subtotalPaise: 10000 },
    ]);
    const calls = accept('processed');
    await processRefund('o4__a');
    await processRefund('o4__b');
    await processRefund('o4__c');
    const amounts = calls.map((c) => c.body.amount as number);
    expect(amounts).toEqual([9667, 9667, 9667]);
    expect(amounts.reduce((n, a) => n + a, 0)).toBe(29001);
  });

  it('gives the remainder to the last ticket even when shares do not divide evenly', async () => {
    await paidOrder('o5', 10000, [
      { vendorId: 'a', subtotalPaise: 3333 },
      { vendorId: 'b', subtotalPaise: 3333 },
      { vendorId: 'c', subtotalPaise: 3334 },
    ]);
    const calls = accept('processed');
    await Promise.all([processRefund('o5__a'), processRefund('o5__b'), processRefund('o5__c')]);
    expect(calls.map((c) => c.body.amount as number).reduce((n, a) => n + a, 0)).toBe(10000);
  });

  it('refunds only its share while another shop is still cooking', async () => {
    await paidOrder('o6', 30000, [
      { vendorId: 'a', subtotalPaise: 10000 },
      { vendorId: 'b', subtotalPaise: 20000, status: 'PREPARING', refund: null },
    ]);
    accept();
    expect(await claimRefund('o6__a')).toMatchObject({ state: 'claimed', refund: { amountPaise: 10000 } });
  });

  it('handles a failed ticket that has no refund record at all (older data)', async () => {
    await paidOrder('o7', 4000, [{ vendorId: 'a', subtotalPaise: 4000, refund: null }]);
    accept('processed');
    expect(await processRefund('o7__a')).toBe('claimed');
    expect(await refundOf('o7__a')).toMatchObject({ status: 'PROCESSED', amountPaise: 4000 });
  });

  it('keeps asking when Razorpay is down, and gives up loudly when Razorpay refuses', async () => {
    await paidOrder('o8', 4000, [{ vendorId: 'a', subtotalPaise: 4000 }]);
    fakeRazorpay({ refund: () => ({ status: 503, json: { error: { description: 'down' } } }) });
    await processRefund('o8__a');
    expect(await refundOf('o8__a')).toMatchObject({ status: 'PENDING' });
    expect((await db.doc('issues/refund_o8__a').get()).exists).toBe(false);

    fakeRazorpay({ refund: () => ({ status: 400, json: { error: { description: 'Your account does not have enough balance to carry out the refund operation.' } } }) });
    await sweepRefunds();
    const r = await refundOf('o8__a');
    expect(r.status).toBe('FAILED');
    expect(r.failReason).toMatch(/enough balance/);
    expect((await db.doc('issues/refund_o8__a').get()).data()).toMatchObject({ reason: 'refund_failed', status: 'open', orderId: 'o8', subOrderId: 'o8__a' });
  });
});

describe('refunds: failures are never silent and never undo a finished refund', () => {
  beforeEach(resetDb);
  const signed = (body: unknown) => {
    const raw = JSON.stringify(body);
    return webhookCall(razorpayWebhook, body, { 'x-razorpay-signature': sign(raw), 'x-razorpay-event-id': uniqueUid('evt') });
  };

  it('opens an issue when Razorpay reports a refund failed', async () => {
    await paidOrder('o9', 4000, [{ vendorId: 'a', subtotalPaise: 4000, refund: { status: 'PENDING', amountPaise: 4000, refundId: 'rf_o9__a' } }]);
    await signed({ event: 'refund.failed', payload: { refund: { entity: { id: 'rfnd_9', receipt: 'rf_o9__a', status: 'failed' } } } });
    expect(await refundOf('o9__a')).toMatchObject({ status: 'FAILED', gatewayRefundId: 'rfnd_9' });
    expect((await db.doc('issues/refund_o9__a').get()).data()).toMatchObject({ reason: 'refund_failed', status: 'open' });
  });

  it('ignores a late or replayed failure for a refund that was processed', async () => {
    await paidOrder('o10', 4000, [{ vendorId: 'a', subtotalPaise: 4000, refund: { status: 'PROCESSED', amountPaise: 4000, refundId: 'rf_o10__a', gatewayRefundId: 'rfnd_10' } }]);
    await signed({ event: 'refund.failed', payload: { refund: { entity: { id: 'rfnd_10', receipt: 'rf_o10__a', status: 'failed' } } } });
    expect(await refundOf('o10__a')).toMatchObject({ status: 'PROCESSED' });
    expect(await settleRefund('o10__a', 'FAILED')).toBe(false);
    expect((await db.doc('issues/refund_o10__a').get()).exists).toBe(false);
  });

  it('lets the manager send a failed refund again with a new refund id, and audits it', async () => {
    await paidOrder('o11', 4000, [{ vendorId: 'a', subtotalPaise: 4000, refund: { status: 'FAILED', amountPaise: 4000, refundId: 'rf_o11__a', gatewayRefundId: 'rfnd_old' } }]);
    const calls = fakeRazorpay({
      getRefund: () => ({ json: { id: 'rfnd_old', amount: 4000, status: 'failed' } }),
      refund: (_u, body) => ({ json: { id: 'rfnd_new', amount: body.amount, receipt: body.receipt, status: 'processed' } }),
    });
    const master = uniqueUid('master');
    await expect(call(financeAction, { action: 'RETRY_REFUND', subOrderId: 'o11__a' }, uniqueUid('staff'), { role: 'vendorStaff', vendorId: 'a' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await call(financeAction, { action: 'RETRY_REFUND', subOrderId: 'o11__a' }, master, { role: 'master' })).toMatchObject({ outcome: 'retried' });
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body.receipt).toBe(refundIdFor('o11__a', 1));
    expect(post.body.receipt).not.toBe('rf_o11__a');
    expect(post.body.amount).toBe(4000);
    expect(await refundOf('o11__a')).toMatchObject({ status: 'PROCESSED', attempt: 1, gatewayRefundId: 'rfnd_new' });
    expect((await db.collection('auditLogs').where('action', '==', 'RETRY_REFUND').get()).size).toBe(1);
    // A second press finds nothing failed.
    await expect(call(financeAction, { action: 'RETRY_REFUND', subOrderId: 'o11__a' }, master, { role: 'master' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('does not pay twice when the "failed" refund had in fact gone through', async () => {
    await paidOrder('o12', 4000, [{ vendorId: 'a', subtotalPaise: 4000, refund: { status: 'FAILED', amountPaise: 4000, refundId: 'rf_o12__a', gatewayRefundId: 'rfnd_ok' } }]);
    const calls = fakeRazorpay({ getRefund: () => ({ json: { id: 'rfnd_ok', amount: 4000, status: 'processed' } }) });
    expect(await retryRefund('o12__a')).toBe('already-processed');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    expect(await refundOf('o12__a')).toMatchObject({ status: 'PROCESSED' });
  });
});

describe('refund ids and sweeper isolation', () => {
  it('keeps refund ids within 40 characters and distinct for long shop ids', () => {
    const a = refundIdFor('o0123456789abcdef01234567__the-roll-house-east');
    const b = refundIdFor('o0123456789abcdef01234567__the-roll-house-west');
    expect(a.length).toBeLessThanOrEqual(40);
    expect(b.length).toBeLessThanOrEqual(40);
    expect(a).not.toBe(b);
    expect(refundIdFor('o1__a')).toBe('rf_o1__a');
    expect(refundIdFor('o1__a', 2).length).toBeLessThanOrEqual(40);
  });

  it('runs the next step when one step throws', async () => {
    expect(
      await sweepStep(
        'broken',
        async () => {
          throw new Error('missing index');
        },
        -1
      )
    ).toBe(-1);
    expect(await sweepStep('fine', async () => 7, 0)).toBe(7);
  });
});
