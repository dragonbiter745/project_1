import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import { startSession } from '../src/callable/startSession';
import { createCheckout } from '../src/callable/createCheckout';
import { razorpayWebhook } from '../src/webhook/razorpayWebhook';
import { reconcilePayments } from '../src/scheduled/sweeper';
import { call, fakeRazorpay, resetDb, seed, sessionFor, sign, uniqueUid, webhookCall } from './helpers';

/**
 * Lunch rush with real-world misbehaviour, through the real functions on the emulator.
 * RUSH_DINERS sets the crowd and RUSH_RATE the arrivals per second (defaults 60 at 1/s keep CI near a minute;
 * before an event run e.g. RUSH_DINERS=300 RUSH_RATE=1). RUSH_RATE=0 sends everyone at once: the emulator
 * cannot model that (see docs/worst-cases.md #43), so use it only against a real test database.
 *   i % 10 in {0,1}: taps Pay twice at the same instant
 *   i % 10 == 2:     opens the payment page and walks away
 *   i % 10 == 3:     pays, closes the app, and the webhook never arrives (reconciler must catch it)
 *   i % 10 in {4,5}: Razorpay delivers the webhook again (a retry)
 *   otherwise:       a normal order, one or both shops
 */
const N = Number(process.env.RUSH_DINERS ?? 60);
const PARALLEL = Number(process.env.RUSH_PARALLEL ?? 40);
/** Diners arriving per second. Unset: everyone at once (a pure burst). Real lunch peaks are well under 1/s. */
const RATE = Number(process.env.RUSH_RATE ?? 1);

type Kind = 'double-tap' | 'abandon' | 'lost-webhook' | 'retry-webhook' | 'normal';
const NO_RETRY = process.env.RUSH_NO_RETRY === '1';
const kindOf = (i: number): Kind =>
  i % 10 <= 1 ? 'double-tap' : i % 10 === 2 ? 'abandon' : i % 10 === 3 ? 'lost-webhook' : i % 10 <= 5 && !NO_RETRY ? 'retry-webhook' : 'normal';

async function pool<T>(items: T[], size: number, fn: (t: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i]!, i);
      }
    })
  );
}

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] ?? 0;

describe(`lunch rush: ${N} diners`, () => {
  const paidAmounts = new Map<string, number>(); // orders Razorpay considers paid (for the reconciler)
  const createCalls = new Map<string, number>();
  const results: Array<{ i: number; kind: Kind; orderId: string; second?: string; shops: number; totalPaise: number }> = [];
  const latency = { checkout: [] as number[], webhook: [] as number[] };
  const errors: string[] = [];

  beforeAll(async () => {
    await resetDb();
    await seed({ paymentsEnabled: true });
    fakeRazorpay({
      createOrder: (_u, body) => {
        createCalls.set(body.receipt, (createCalls.get(body.receipt) ?? 0) + 1);
        return { json: { id: `order_${body.receipt}`, amount: body.amount, currency: 'INR', receipt: body.receipt, status: 'created' } };
      },
      orderPayments: (url) => {
        const rzpId = decodeURIComponent(url.split('/orders/')[1]!.split(/[/?]/)[0]!);
        const id = rzpId.replace(/^order_/, '');
        const amount = paidAmounts.get(id);
        return { json: { items: amount !== undefined ? [{ id: `pay_${id}`, order_id: rzpId, amount, currency: 'INR', status: 'captured', method: 'upi' }] : [] } };
      },
    });

    const t0 = Date.now();
    await pool([...Array(N).keys()], RATE ? Math.max(PARALLEL, N) : PARALLEL, async (i) => {
      const kind = kindOf(i);
      if (RATE) await new Promise((r) => setTimeout(r, Math.max(0, t0 + (i / RATE) * 1000 - Date.now())));
      try {
        const uid = uniqueUid(`rush${i}`);
        const sessionId = await sessionFor(startSession, uid);
        const both = i % 3 !== 0;
        const items = [
          { itemId: 'rm-1', vendorId: 'v-rm', name: 'Paneer Roll', pricePaise: 1, veg: true, qty: 1 + (i % 3) },
          ...(both ? [{ itemId: 'sv-1', vendorId: 'v-sv', name: 'Masala Dosa', pricePaise: 1, veg: true, qty: 1 }] : []),
        ];
        const body = { sessionId, checkoutKey: `rush-key-${i}-${uid}`, items, customerPhone: '9123456780' };
        const c0 = Date.now();
        const [first, second] = await Promise.all([call(createCheckout, body, uid), kind === 'double-tap' ? call(createCheckout, body, uid) : Promise.resolve(undefined)]);
        latency.checkout.push(Date.now() - c0);
        results.push({ i, kind, orderId: first.orderId, second: second?.orderId, shops: both ? 2 : 1, totalPaise: first.totalPaise });
        if (kind === 'abandon') return;
        paidAmounts.set(first.orderId, first.totalPaise);
        if (kind === 'lost-webhook') return;
        const event = {
          event: 'payment.captured',
          payload: { payment: { entity: { id: `pay_${1000 + i}`, order_id: `order_${first.orderId}`, amount: first.totalPaise, currency: 'INR', status: 'captured', method: 'upi' } } },
        };
        const headers = { 'x-razorpay-signature': sign(JSON.stringify(event)) };
        const w0 = Date.now();
        // Razorpay retries after a delivery, it does not send two at the same instant (the emulator cannot model
        // two simultaneous read-modify-writes of one document; production aborts and retries the younger one).
        const sends = [await webhookCall(razorpayWebhook as any, event, headers)];
        if (kind === 'retry-webhook') sends.push(await webhookCall(razorpayWebhook as any, event, headers));
        latency.webhook.push(Date.now() - w0);
        for (const s of sends) if (s.status !== 200) errors.push(`webhook ${s.status} for diner ${i}`);
      } catch (err) {
        errors.push(`diner ${i} (${kind}): ${(err as Error).message}`);
      }
    });
    // The reconciler runs every minute in production: play its next 30 runs to find the lost webhooks.
    let reconciled = 0;
    const end = Date.now();
    for (let minute = 1; minute <= 30; minute++) reconciled += (await reconcilePayments(end + minute * 60_000)).paid;
    const wallMs = Date.now() - t0;
    console.log(
      `[rush] ${N} diners, ${RATE ? `arriving ${RATE}/s` : `${PARALLEL} at a time`}: ${(wallMs / 1000).toFixed(1)} s total; checkout p50 ${pct(latency.checkout, 50)} ms p95 ${pct(latency.checkout, 95)} ms; ` +
        `webhook p50 ${pct(latency.webhook, 50)} ms p95 ${pct(latency.webhook, 95)} ms; reconciled ${reconciled}; errors ${errors.length}` +
        (errors.length ? `\n[rush] first errors: ${errors.slice(0, 5).join(' | ')}` : '')
    );
  }, 900_000);

  afterAll(() => vi.unstubAllGlobals());

  it('every diner got through without an error', () => {
    expect(errors).toEqual([]);
    expect(results).toHaveLength(N);
  });

  it('a double tap on Pay makes one order and one Razorpay order, never two', () => {
    for (const r of results.filter((x) => x.kind === 'double-tap')) expect(r.second).toBe(r.orderId);
    expect(new Set(results.map((r) => r.orderId)).size).toBe(results.length);
    for (const r of results) expect(createCalls.get(r.orderId) ?? 0).toBeLessThanOrEqual(1);
  });

  it('every paid order reaches its kitchens exactly once, including lost webhooks and retries', async () => {
    const tickets = await db.collection('subOrders').get();
    const byOrder = new Map<string, string[]>();
    for (const t of tickets.docs) byOrder.set(t.data().orderId, [...(byOrder.get(t.data().orderId) ?? []), t.data().vendorId]);
    for (const r of results) {
      const shops = byOrder.get(r.orderId) ?? [];
      if (r.kind === 'abandon') expect(shops).toEqual([]);
      else {
        expect(shops.length).toBe(r.shops);
        expect(new Set(shops).size).toBe(shops.length);
      }
    }
    const paid = await db.collection('orders').where('status', '==', 'PAID').get();
    expect(paid.size).toBe(results.filter((r) => r.kind !== 'abandon').length);
  });

  it('no two tickets at one shop share a token number', async () => {
    const tickets = await db.collection('subOrders').get();
    const seen = new Map<string, Set<string>>();
    for (const t of tickets.docs) {
      const { vendorId, token } = t.data() as { vendorId: string; token: string };
      const set = seen.get(vendorId) ?? new Set<string>();
      expect(set.has(token)).toBe(false);
      set.add(token);
      seen.set(vendorId, set);
    }
  });

  it('nothing is flagged and no unpaid order is cooked', async () => {
    const flagged = await db.collection('orders').where('payment.status', '==', 'FLAGGED').get();
    expect(flagged.size).toBe(0);
    for (const r of results.filter((x) => x.kind === 'abandon')) {
      const o = (await db.doc(`orders/${r.orderId}`).get()).data()!;
      expect(o.status).not.toBe('PAID');
    }
  });
});
