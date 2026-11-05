import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOrder, createRefund, getOrder, MIN_AMOUNT_PAISE, RazorpayError, verifyPaymentSignature, verifyWebhookSignature } from '../src/lib/razorpay';
import { sign, signPayment } from './helpers';

// The e2e suite runs the Functions emulator with a placeholder key and a built-in Razorpay stand-in.
// That stand-in must be impossible to reach from a deployed function: it would otherwise answer "paid".

const reply = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
const saved = { id: process.env.RAZORPAY_KEY_ID, emu: process.env.FUNCTIONS_EMULATOR };

beforeEach(() => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_placeholder';
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of [['RAZORPAY_KEY_ID', saved.id], ['FUNCTIONS_EMULATOR', saved.emu]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('razorpay emulator stand-in', () => {
  it('is never used by a deployed function, even with the placeholder key', async () => {
    delete process.env.FUNCTIONS_EMULATOR;
    const fetchMock = reply({ id: 'order_1', status: 'created', amount: 14900, currency: 'INR' });
    vi.stubGlobal('fetch', fetchMock);
    const res = await getOrder('order_1');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://api.razorpay.com/v1/orders/order_1');
    expect(res.status).toBe('created'); // not the stand-in's "paid"
  });

  it('is never used with a live key, even inside the emulator', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.RAZORPAY_KEY_ID = 'rzp_live_abc';
    const fetchMock = reply({ id: 'order_1', status: 'created', amount: 14900, currency: 'INR' });
    vi.stubGlobal('fetch', fetchMock);
    await getOrder('order_1');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not answer for a real test key, even inside the emulator', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_SomeRealKey';
    const fetchMock = reply({ id: 'rfnd_1', status: 'pending', amount: 14900 });
    vi.stubGlobal('fetch', fetchMock);
    await createRefund('pay_1', 'rf_1', 14900, 'test');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('answers locally only in the emulator with the placeholder key', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const created = await createOrder({ orderId: 'o1', amountPaise: 14900 });
    expect(created.id).toMatch(/^order_mock_/);
    expect(created.amount).toBe(14900); // paise in, paise out
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('razorpay order amounts', () => {
  it('refuses amounts under the 100 paise minimum and non-integers before calling Razorpay', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    for (const amountPaise of [0, MIN_AMOUNT_PAISE - 1, 150.5, -500]) {
      expect(() => createOrder({ orderId: 'o1', amountPaise })).toThrow(RazorpayError);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a Razorpay error body to RazorpayError with its status', async () => {
    delete process.env.FUNCTIONS_EMULATOR;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } }), { status: 401 })));
    await expect(createOrder({ orderId: 'o1', amountPaise: 14900 })).rejects.toMatchObject({ status: 401, message: 'Authentication failed' });
  });
});

describe('razorpay signatures', () => {
  it('accepts HMAC(order_id|payment_id) with the key secret and nothing else', () => {
    const good = signPayment('order_A', 'pay_B');
    expect(verifyPaymentSignature('order_A', 'pay_B', good, 'test-key-secret')).toBe(true);
    expect(verifyPaymentSignature('order_A', 'pay_C', good, 'test-key-secret')).toBe(false);
    expect(verifyPaymentSignature('order_X', 'pay_B', good, 'test-key-secret')).toBe(false);
    expect(verifyPaymentSignature('order_A', 'pay_B', good, 'wrong-secret')).toBe(false);
    expect(verifyPaymentSignature('order_A', 'pay_B', '', 'test-key-secret')).toBe(false);
  });

  it('accepts a webhook signature only for the exact raw body', () => {
    const raw = JSON.stringify({ event: 'payment.captured' });
    expect(verifyWebhookSignature(raw, sign(raw), 'test-webhook-secret')).toBe(true);
    expect(verifyWebhookSignature(raw + ' ', sign(raw), 'test-webhook-secret')).toBe(false);
    expect(verifyWebhookSignature(raw, 'nope', 'test-webhook-secret')).toBe(false);
  });
});
