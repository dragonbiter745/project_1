import { onRequest } from 'firebase-functions/v2/https';
import * as crypto from 'crypto';
import {
  formatVendorToken,
  type Order,
  type Vendor,
} from '@foodcourt/shared';

import { db } from '../db';

function verifyCashfreeSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  secretKey: string
): boolean {
  try {
    const payload = `${timestamp}${rawBody}`;
    const generatedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(payload)
      .digest('base64');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(generatedSignature)
    );
  } catch (err) {
    return false;
  }
}

export const cashfreeWebhook = onRequest(
  {
    region: 'asia-south1',
    cors: false,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const timestamp = req.headers['x-webhook-timestamp'] as string;
    const signature = req.headers['x-webhook-signature'] as string;
    const secretKey = process.env.CASHFREE_SECRET_KEY;

    // Verify signature if secret key is present
    if (secretKey && timestamp && signature) {
      const rawBody = typeof req.rawBody === 'string' ? req.rawBody : (req.rawBody as Buffer)?.toString('utf8') || JSON.stringify(req.body);
      const isValid = verifyCashfreeSignature(rawBody, timestamp, signature, secretKey);
      if (!isValid) {
        console.warn('Invalid Cashfree webhook signature');
        res.status(401).send('Invalid signature');
        return;
      }
    }

    const event = req.body;
    const orderId = event?.data?.order?.order_id;
    const paymentStatus = event?.data?.payment?.payment_status;

    if (!orderId) {
      res.status(400).send('Missing order_id');
      return;
    }

    if (paymentStatus !== 'SUCCESS') {
      console.log(`Payment status for order ${orderId} is ${paymentStatus}. No suborders created.`);
      res.status(200).json({ received: true });
      return;
    }

    const orderRef = db.collection('orders').doc(orderId);

    try {
      await db.runTransaction(async (transaction) => {
        const orderDoc = await transaction.get(orderRef);
        if (!orderDoc.exists) {
          throw new Error(`Order ${orderId} not found`);
        }

        const order = orderDoc.data() as Order;
        if (order.status === 'PAID') {
          // Already processed idempotently
          return;
        }

        const now = Date.now();
        const dateKey = order.dateKey;

        // 1. Mark Order as PAID
        transaction.update(orderRef, {
          status: 'PAID',
          'payment.status': 'SUCCESS',
          'payment.paidAt': now,
          'payment.cfPaymentId': event?.data?.payment?.cf_payment_id || null,
          'payment.method': event?.data?.payment?.payment_group || 'UPI',
        });

        // 2. Group items by vendor and create subOrders
        const uniqueVendorIds = Array.from(new Set(order.items.map((i) => i.vendorId)));

        for (const vId of uniqueVendorIds) {
          const vendorItems = order.items.filter((i) => i.vendorId === vId);
          const vendorSubtotalPaise = vendorItems.reduce((acc, i) => acc + i.pricePaise * i.qty, 0);

          const vendorCounterRef = db.collection('counters').doc(`${dateKey}_${vId}`);
          const vendorCounterDoc = await transaction.get(vendorCounterRef);
          const currentSeq = vendorCounterDoc.exists ? (vendorCounterDoc.data()?.count || 0) : 0;
          const nextSeq = currentSeq + 1;

          transaction.set(vendorCounterRef, { count: nextSeq }, { merge: true });

          const vendorRef = db.collection('vendors').doc(vId);
          const vendorDoc = await transaction.get(vendorRef);
          const vendorData = vendorDoc.data() as Vendor | undefined;
          const vendorCode = vendorData?.code || 'RM';
          const token = formatVendorToken(vendorCode, nextSeq);

          const subOrderRef = db.collection('subOrders').doc();
          transaction.set(subOrderRef, {
            orderId: orderRef.id,
            vendorId: vId,
            vendorName: vendorData?.name || '',
            token,
            tableLabel: order.tableLabel,
            customerDisplay: `#${order.dateKey}`,
            items: vendorItems,
            subtotalPaise: vendorSubtotalPaise,
            status: 'NEW',
            ts: {
              placed: now,
            },
          });
        }
      });

      console.log(`Successfully processed Cashfree payment for order ${orderId}`);
      res.status(200).json({ success: true });
    } catch (err: any) {
      console.error('Error handling Cashfree webhook:', err);
      res.status(500).send('Webhook processing failed');
    }
  }
);
