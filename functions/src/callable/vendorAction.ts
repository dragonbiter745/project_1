import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import {
  VENDOR_ACTION_STEPS,
  VendorActionSchema,
  calculatePointsEarned,
  canApplyVendorAction,
  type GlobalConfig,
  type SubOrder,
} from '@foodcourt/shared';
import { REGION } from '../config';
import { db } from '../db';
import { limitShared, requireUid, roleOf } from '../lib/guard';
import { syncParentStatus, timelineKey } from '../lib/orders';

/**
 * Every kitchen status change goes through here and the shared status machine. Shop staff can only
 * touch their own shop's tickets; only the court master can cancel.
 */
export const vendorAction = onCall({ region: REGION, minInstances: 1, maxInstances: 50, concurrency: 80, timeoutSeconds: 20 }, async (req) => {
  const uid = requireUid(req);
  const { role, vendorId: staffVendor } = roleOf(req);
  if (!role) throw new HttpsError('permission-denied', 'Sign in with a kitchen or manager account.');
  await limitShared(`vendor:${uid}`, 400, 300);

  const parsed = VendorActionSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid action.');
  const { subOrderId, action, prepTimeOverrideMin, reason } = parsed.data;
  if ((action === 'REJECT' || action === 'CANCEL') && !reason) throw new HttpsError('invalid-argument', 'Give the diner a reason.');

  const ref = db.collection('subOrders').doc(subOrderId);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'That ticket no longer exists.');
    const ticket = snap.data() as SubOrder;
    const isMaster = role === 'master';
    if (!isMaster && staffVendor !== ticket.vendorId) throw new HttpsError('permission-denied', 'This ticket belongs to another shop.');
    if (action === 'CANCEL' && !isMaster) throw new HttpsError('permission-denied', 'Only the court manager can cancel; reject the ticket instead.');
    if (!canApplyVendorAction(ticket.status, action)) {
      throw new HttpsError('failed-precondition', `This ticket is already ${ticket.status.toLowerCase().replace('_', ' ')}.`);
    }
    const now = Date.now();
    const steps = VENDOR_ACTION_STEPS[action];
    const updates: Record<string, unknown> = { status: steps[steps.length - 1], updatedAt: now, updatedBy: uid };
    for (const s of steps) updates[`ts.${timelineKey[s]}`] = now;
    if (action === 'UNDO_READY') updates['ts.ready'] = FieldValue.delete();
    if (prepTimeOverrideMin) updates.prepTimeOverrideMin = prepTimeOverrideMin;
    if (action === 'REJECT') updates.rejectReason = reason;
    if (action === 'CANCEL') updates.cancelReason = reason;
    tx.update(ref, updates);
    return { ticket, status: updates.status as string, now };
  });

  await syncParentStatus(result.ticket.orderId);

  // Loyalty points on collection, idempotent per ticket.
  if (action === 'COLLECTED' && result.ticket.uid) {
    const config = (await db.collection('config').doc('global').get()).data() as GlobalConfig | undefined;
    const points = config?.flags.loyaltyEnabled ? calculatePointsEarned(result.ticket.subtotalPaise) : 0;
    if (points > 0) {
      const ledgerRef = db.collection('pointsLedger').doc(`earn_${subOrderId}`);
      await db.runTransaction(async (tx) => {
        if ((await tx.get(ledgerRef)).exists) return;
        tx.set(ledgerRef, { uid: result.ticket.uid, orderId: result.ticket.orderId, subOrderId, type: 'earn', points, createdAt: result.now, notes: `Earned from ${result.ticket.token}` });
        tx.set(db.collection('users').doc(result.ticket.uid!), { pointsBalance: FieldValue.increment(points), lifetimeSpendPaise: FieldValue.increment(result.ticket.subtotalPaise) }, { merge: true });
      });
    }
  }
  return { subOrderId, status: result.status, updatedAt: result.now };
});
