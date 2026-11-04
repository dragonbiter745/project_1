import * as crypto from 'crypto';
import { URLS } from './constants';

export const TEST_SECRET = 'TEST_CASHFREE_SECRET_KEY';

export function signWebhook(body: string, timestamp: string, secret = TEST_SECRET): string {
  return crypto.createHmac('sha256', secret).update(timestamp + body).digest('base64');
}

export interface PaymentWebhookOptions {
  orderId: string;
  orderAmountPaise: number;
  cfPaymentId?: string;
  currency?: string;
  secret?: string;
  badSignature?: boolean;
}

export async function sendPaymentSuccessWebhook(opts: PaymentWebhookOptions): Promise<{ status: number; text: string; json?: any }> {
  const ts = String(Math.floor(Date.now() / 1000));
  const amountRupees = opts.orderAmountPaise / 100;
  const payload = {
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    data: {
      order: {
        order_id: opts.orderId,
        order_amount: amountRupees,
        order_currency: opts.currency ?? 'INR',
      },
      payment: {
        payment_status: 'SUCCESS',
        payment_amount: amountRupees,
        cf_payment_id: opts.cfPaymentId ?? `cf_pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        payment_group: 'upi',
      },
    },
  };

  const body = JSON.stringify(payload);
  const signature = opts.badSignature
    ? 'invalid_signature_xyz'
    : signWebhook(body, ts, opts.secret ?? TEST_SECRET);

  const res = await fetch(`${URLS.functions}/cashfreeWebhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-timestamp': ts,
      'x-webhook-signature': signature,
    },
    body,
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {}

  return { status: res.status, text, json };
}

export async function sendRefundWebhook(opts: {
  refundId: string;
  orderId: string;
  status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
  cfRefundId?: string;
  secret?: string;
}): Promise<{ status: number; text: string; json?: any }> {
  const ts = String(Math.floor(Date.now() / 1000));
  const payload = {
    type: 'REFUND_STATUS_WEBHOOK',
    data: {
      refund: {
        refund_id: opts.refundId,
        refund_status: opts.status,
        cf_refund_id: opts.cfRefundId ?? `cf_ref_${Date.now()}`,
        order_id: opts.orderId,
      },
    },
  };

  const body = JSON.stringify(payload);
  const signature = signWebhook(body, ts, opts.secret ?? TEST_SECRET);

  const res = await fetch(`${URLS.functions}/cashfreeWebhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-timestamp': ts,
      'x-webhook-signature': signature,
    },
    body,
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {}

  return { status: res.status, text, json };
}
