import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { ReportIssueSchema } from '@foodcourt/shared';
import { REGION } from '../config';
import { db } from '../db';
import { limitShared, requireUid } from '../lib/guard';

/** Diners report a problem with their own order; validated and rate-limited instead of an open client write. */
export const reportIssue = onCall({ region: REGION, maxInstances: 20, timeoutSeconds: 15 }, async (req) => {
  const uid = requireUid(req);
  await limitShared(`issue:${uid}`, 5, 3600);
  const parsed = ReportIssueSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid report.');
  const { orderId, subOrderId, reason, text } = parsed.data;
  const order = await db.collection('orders').doc(orderId).get();
  if (!order.exists || order.data()!.uid !== uid) throw new HttpsError('permission-denied', 'You can only report your own orders.');
  let vendorId: string | null = null;
  if (subOrderId) {
    const ticket = await db.collection('subOrders').doc(subOrderId).get();
    if (!ticket.exists || ticket.data()!.orderId !== orderId) throw new HttpsError('invalid-argument', 'That ticket is not part of this order.');
    vendorId = ticket.data()!.vendorId as string;
  }
  const ref = await db.collection('issues').add({ orderId, subOrderId: subOrderId ?? null, vendorId, reason, text: text || null, uid, status: 'open', createdAt: Date.now() });
  return { issueId: ref.id };
});
