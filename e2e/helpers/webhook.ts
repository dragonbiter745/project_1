import * as crypto from 'crypto';
import { URLS } from './constants';
import { getFirestoreDoc } from './firestore';

/** RAZORPAY_WEBHOOK_SECRET in functions/.env.local (the emulator's placeholder). */
export const TEST_SECRET = 'rzp_test_placeholder_webhook_secret';

/** Razorpay signs the raw body with HMAC-SHA256 and sends it hex-encoded in x-razorpay-signature. */
export function signWebhook(body: string, secret = TEST_SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

export interface PaymentWebhookOptions {
  orderId: string;
  orderAmountPaise: number;
  /** Razorpay payment id (pay_...). */
  paymentId?: string;
  currency?: string;
  secret?: string;
  badSignature?: boolean;
  /** Defaults to the id createCheckout stored on the order (the emulator stand-in's ids are not predictable). */
  rzpOrderId?: string;
}

type WebhookResult = { status: number; text: string; json?: any };

async function post(body: string, signature: string): Promise<WebhookResult> {
  const res = await fetch(`${URLS.functions}/razorpayWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature },
    body,
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, text, json };
}

/** Razorpay's payment.captured event. The webhook finds our order by the Razorpay order id on it. */
export async function sendPaymentSuccessWebhook(opts: PaymentWebhookOptions): Promise<WebhookResult> {
  const rzpOrderId = opts.rzpOrderId ?? (await lookupRzpOrderId(opts.orderId));
  const payload = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: opts.paymentId ?? `pay_${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
          order_id: rzpOrderId,
          amount: opts.orderAmountPaise,
          currency: opts.currency ?? 'INR',
          status: 'captured',
          method: 'upi',
        },
      },
    },
  };
  const body = JSON.stringify(payload);
  return post(body, opts.badSignature ? 'invalid_signature_xyz' : signWebhook(body, opts.secret ?? TEST_SECRET));
}

export async function sendRefundWebhook(opts: {
  refundId: string;
  orderId: string;
  status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
  gatewayRefundId?: string;
  secret?: string;
}): Promise<WebhookResult> {
  const processed = opts.status === 'SUCCESS';
  const payload = {
    event: processed ? 'refund.processed' : 'refund.failed',
    payload: {
      refund: {
        entity: { id: opts.gatewayRefundId ?? `rfnd_${Date.now()}`, receipt: opts.refundId, status: processed ? 'processed' : 'failed' },
      },
    },
  };
  const body = JSON.stringify(payload);
  return post(body, signWebhook(body, opts.secret ?? TEST_SECRET));
}

/** The Razorpay order id createCheckout stored on the order. */
async function lookupRzpOrderId(orderId: string): Promise<string> {
  const order = await getFirestoreDoc('orders', orderId);
  const id = order?.payment?.rzpOrderId;
  if (!id) throw new Error(`Order ${orderId} has no Razorpay order id yet`);
  return id;
}
