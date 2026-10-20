import * as crypto from 'crypto';
import { CASHFREE_APP_ID, CASHFREE_ENV, CASHFREE_SECRET_KEY, projectId, REGION } from '../config';

const API_VERSION = '2023-08-01';

export class CashfreeError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
  }
}

export const isProduction = () => CASHFREE_ENV.value() === 'PRODUCTION';
const baseUrl = () => (isProduction() ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com');

/** Cashfree amounts are rupees with two decimals; ours are integer paise. */
export const toRupees = (paise: number) => Math.round(paise) / 100;
export const toPaise = (rupees: number | string) => Math.round(Number(rupees) * 100);

async function call<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string }): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: init.method,
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': CASHFREE_APP_ID.value(),
      'x-client-secret': CASHFREE_SECRET_KEY.value(),
      'x-api-version': API_VERSION,
      ...(init.idempotencyKey ? { 'x-idempotency-key': init.idempotencyKey } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new CashfreeError(res.status, String(data.message ?? `Cashfree ${res.status}`), data.code as string | undefined);
  return data as T;
}

export interface CfOrder {
  order_id: string;
  cf_order_id?: string | number;
  order_status: 'ACTIVE' | 'PAID' | 'EXPIRED' | 'TERMINATED' | 'TERMINATION_REQUESTED';
  order_amount: number;
  order_currency: string;
  payment_session_id?: string;
}

export function createOrder(input: {
  orderId: string;
  amountPaise: number;
  customerId: string;
  customerPhone: string;
  customerName: string;
  returnUrl: string;
  expiresAt: number;
}): Promise<CfOrder> {
  return call<CfOrder>('/pg/orders', {
    method: 'POST',
    idempotencyKey: input.orderId,
    body: {
      order_id: input.orderId,
      order_amount: toRupees(input.amountPaise),
      order_currency: 'INR',
      customer_details: {
        customer_id: input.customerId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50) || 'diner',
        customer_phone: input.customerPhone,
        customer_name: input.customerName.slice(0, 60),
      },
      order_meta: {
        return_url: input.returnUrl,
        notify_url: `https://${REGION}-${projectId()}.cloudfunctions.net/cashfreeWebhook`,
      },
      order_expiry_time: new Date(input.expiresAt).toISOString(),
    },
  });
}

export const getOrder = (orderId: string) => call<CfOrder>(`/pg/orders/${encodeURIComponent(orderId)}`, { method: 'GET' });

export interface CfRefund {
  refund_id: string;
  cf_refund_id?: string | number;
  refund_status: 'SUCCESS' | 'PENDING' | 'CANCELLED' | 'ONHOLD' | 'FAILED';
  refund_amount: number;
}

/** Idempotent on refundId: asking twice returns the existing refund. */
export async function createRefund(orderId: string, refundId: string, amountPaise: number, note: string): Promise<CfRefund> {
  try {
    return await call<CfRefund>(`/pg/orders/${encodeURIComponent(orderId)}/refunds`, {
      method: 'POST',
      idempotencyKey: refundId,
      body: { refund_amount: toRupees(amountPaise), refund_id: refundId, refund_note: note.slice(0, 100) },
    });
  } catch (err) {
    if (err instanceof CashfreeError && err.status === 409) return getRefund(orderId, refundId);
    throw err;
  }
}

export const getRefund = (orderId: string, refundId: string) =>
  call<CfRefund>(`/pg/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(refundId)}`, { method: 'GET' });

/** Cashfree signs `timestamp + rawBody` with HMAC-SHA256 using the secret key, base64 encoded. */
export function verifyWebhookSignature(rawBody: string, timestamp: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(timestamp + rawBody).digest('base64');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
