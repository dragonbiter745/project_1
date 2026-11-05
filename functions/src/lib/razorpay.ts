import * as crypto from 'crypto';
import { isEmulator, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } from '../config';

const BASE_URL = 'https://api.razorpay.com/v1';
/** Razorpay's own floor for an order. */
export const MIN_AMOUNT_PAISE = 100;
/** Key id the local e2e suite uses; with it the Functions emulator answers for Razorpay (see call()). */
export const STANDIN_KEY_ID = 'rzp_test_placeholder';

export class RazorpayError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
  }
}

/** rzp_live_ keys move real money; everything else is test mode. */
export const isLiveMode = () => RAZORPAY_KEY_ID.value().startsWith('rzp_live_');

const hmacHex = (data: string, secret: string) => crypto.createHmac('sha256', secret).update(data).digest('hex');

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function call<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string> }): Promise<T> {
  // Local e2e only: the Functions emulator with the placeholder key never calls Razorpay. A deployed function
  // (FUNCTIONS_EMULATOR unset) can never take this branch, so it can't fake a captured payment or a refund.
  if (isEmulator() && !isLiveMode() && RAZORPAY_KEY_ID.value() === STANDIN_KEY_ID) {
    const b = (init.body ?? {}) as any;
    if (path === '/orders' && init.method === 'POST') {
      return { id: `order_mock_${Date.now()}`, amount: b.amount, currency: 'INR', receipt: b.receipt, status: 'created' } as T;
    }
    if (/^\/payments\/[^/]+\/refund$/.test(path) && init.method === 'POST') {
      return { id: `rfnd_mock_${Date.now()}`, amount: b.amount, receipt: b.receipt, status: 'processed' } as T;
    }
    if (/^\/payments\/[^/]+$/.test(path) && init.method === 'GET') {
      // The stand-in never confirms a payment: verifyPayment then defers to the webhook, which e2e signs itself.
      throw new RazorpayError(503, 'Stand-in cannot read payments back');
    }
    if (/^\/orders\/[^/]+\/payments$/.test(path)) {
      return { items: [{ id: 'pay_mock', order_id: path.split('/')[2], amount: 100, currency: 'INR', status: 'captured', method: 'upi' }] } as T;
    }
    if (/^\/orders\/[^/]+$/.test(path)) {
      return { id: path.split('/')[2], amount: 100, amount_paid: 100, currency: 'INR', status: 'paid' } as T;
    }
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: init.method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID.value()}:${RAZORPAY_KEY_SECRET.value()}`).toString('base64')}`,
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) throw new RazorpayError(res.status, String(data.error?.description ?? `Razorpay ${res.status}`), data.error?.code as string | undefined);
  return data as T;
}

export interface RzpOrder {
  id: string;
  amount: number;
  amount_paid?: number;
  currency: string;
  receipt?: string;
  status: 'created' | 'attempted' | 'paid';
}

/** Amounts are integer paise on both sides: no conversion. `receipt` carries our orderId. */
export function createOrder(input: { orderId: string; amountPaise: number }): Promise<RzpOrder> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise < MIN_AMOUNT_PAISE) {
    throw new RazorpayError(400, `Amount must be at least ${MIN_AMOUNT_PAISE} paise`);
  }
  return call<RzpOrder>('/orders', {
    method: 'POST',
    body: { amount: input.amountPaise, currency: 'INR', receipt: input.orderId, notes: { orderId: input.orderId } },
  });
}

export const getOrder = (rzpOrderId: string) => call<RzpOrder>(`/orders/${encodeURIComponent(rzpOrderId)}`, { method: 'GET' });

export interface RzpPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  method?: string;
}

export const getPayment = (paymentId: string) => call<RzpPayment>(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });

/** The captured payment for an order, if any (used when a webhook was missed). */
export async function getCapturedPayment(rzpOrderId: string): Promise<RzpPayment | undefined> {
  const list = await call<{ items: RzpPayment[] }>(`/orders/${encodeURIComponent(rzpOrderId)}/payments`, { method: 'GET' });
  return list.items.find((p) => p.status === 'captured');
}

export interface RzpRefund {
  id: string;
  amount: number;
  receipt?: string | null;
  status: 'pending' | 'processed' | 'failed';
}

/** Idempotent on refundId: Razorpay returns the original refund for a repeated idempotency key. */
export function createRefund(paymentId: string, refundId: string, amountPaise: number, note: string): Promise<RzpRefund> {
  return call<RzpRefund>(`/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: 'POST',
    headers: { 'X-Refund-Idempotency': refundId },
    body: { amount: amountPaise, receipt: refundId, notes: { note: note.slice(0, 100) } },
  });
}

export const getRefund = (gatewayRefundId: string) => call<RzpRefund>(`/refunds/${encodeURIComponent(gatewayRefundId)}`, { method: 'GET' });

/** Checkout success check: HMAC-SHA256(order_id + "|" + payment_id, key secret), hex. */
export function verifyPaymentSignature(rzpOrderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  return safeEqual(signature, hmacHex(`${rzpOrderId}|${paymentId}`, keySecret));
}

/** Webhooks: HMAC-SHA256(raw body, webhook secret), hex, in the x-razorpay-signature header. */
export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  return safeEqual(signature, hmacHex(rawBody, webhookSecret));
}
