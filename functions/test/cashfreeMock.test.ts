import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOrder, createRefund, getOrder } from '../src/lib/cashfree';

// The e2e suite runs the Functions emulator with placeholder TEST_ keys and a built-in Cashfree stand-in.
// That stand-in must be impossible to reach from a deployed function: it would otherwise answer "PAID".

const realFetchReply = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
const order = { orderId: 'o1', amountPaise: 14900, customerId: 'u1', customerPhone: '9999999999', customerName: 'A', returnUrl: 'https://x.test', expiresAt: Date.now() + 1.2e6 };

const saved = { id: process.env.CASHFREE_APP_ID, env: process.env.CASHFREE_ENV, emu: process.env.FUNCTIONS_EMULATOR };

beforeEach(() => {
  process.env.CASHFREE_APP_ID = 'TEST_placeholder';
  process.env.CASHFREE_ENV = 'SANDBOX';
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of [['CASHFREE_APP_ID', saved.id], ['CASHFREE_ENV', saved.env], ['FUNCTIONS_EMULATOR', saved.emu]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('cashfree emulator stand-in', () => {
  it('is never used by a deployed function, even with a TEST_ key in sandbox', async () => {
    delete process.env.FUNCTIONS_EMULATOR;
    const fetchMock = realFetchReply({ order_id: 'o1', order_status: 'ACTIVE', order_amount: 149, order_currency: 'INR' });
    vi.stubGlobal('fetch', fetchMock);
    const res = await getOrder('o1');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://sandbox.cashfree.com/pg/orders/o1');
    expect(res.order_status).toBe('ACTIVE'); // not the stand-in's PAID
  });

  it('is never used in PRODUCTION, even inside the emulator', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.CASHFREE_ENV = 'PRODUCTION';
    const fetchMock = realFetchReply({ order_id: 'o1', order_status: 'ACTIVE', order_amount: 149, order_currency: 'INR' });
    vi.stubGlobal('fetch', fetchMock);
    await getOrder('o1');
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://api.cashfree.com/pg/orders/o1');
  });

  it('does not answer without a TEST_ key, even inside the emulator', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.CASHFREE_APP_ID = 'real-looking-id';
    const fetchMock = realFetchReply({ refund_id: 'r1', refund_status: 'PENDING', refund_amount: 149 });
    vi.stubGlobal('fetch', fetchMock);
    await createRefund('o1', 'r1', 14900, 'test');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('answers locally only in the emulator with a TEST_ key and sandbox mode', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const created = await createOrder(order);
    expect(created.payment_session_id).toMatch(/^session_mock_/);
    expect(created.order_amount).toBe(149); // rupees on the wire, from integer paise
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
