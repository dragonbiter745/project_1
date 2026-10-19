import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {
  VendorActionSchema,
  canTransitionSubOrder,
  deriveParentOrderStatus,
  calculatePointsEarned,
  type SubOrderStatus,
  type SubOrder,
} from '@foodcourt/shared';

import { db } from '../db';

export const vendorAction = onCall(
  {
    region: 'asia-south1',
    cors: true,
  },
  async (request) => {
    const parseResult = VendorActionSchema.safeParse(request.data);
    if (!parseResult.success) {
      throw new HttpsError('invalid-argument', parseResult.error.message);
    }

    const { subOrderId, action, prepTimeOverrideMin, rejectReason } = parseResult.data;
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Staff must be logged in.');
    }

    const subOrderRef = db.collection('subOrders').doc(subOrderId);
    const subOrderDoc = await subOrderRef.get();
    if (!subOrderDoc.exists) {
      throw new HttpsError('not-found', 'Sub-order not found.');
    }

    const subOrder = subOrderDoc.data() as SubOrder;
    const vendorId = subOrder.vendorId;

    // Check custom claims
    const isMaster = auth.token.role === 'master';
    const isVendorStaff =
      (auth.token.role === 'vendorAdmin' || auth.token.role === 'vendorStaff') &&
      auth.token.vendorId === vendorId;

    // In local dev allow bypassing claim check if emulator/dev
    const isDev = process.env.NODE_ENV !== 'production';
    if (!isMaster && !isVendorStaff && !isDev) {
      throw new HttpsError('permission-denied', 'You do not have permission to manage this kitchen ticket.');
    }

    const targetStatus: SubOrderStatus = action as SubOrderStatus;

    if (!canTransitionSubOrder(subOrder.status, targetStatus)) {
      throw new HttpsError(
        'failed-precondition',
        `Illegal status transition from ${subOrder.status} to ${targetStatus}.`
      );
    }

    const now = Date.now();
    const tsKey = `ts.${targetStatus.toLowerCase()}`;
    const updates: Record<string, any> = {
      status: targetStatus,
      [tsKey]: now,
    };

    if (prepTimeOverrideMin) {
      updates.prepTimeOverrideMin = prepTimeOverrideMin;
    }

    if (targetStatus === 'REJECTED') {
      if (!rejectReason) {
        throw new HttpsError('invalid-argument', 'A reason is required to reject an order.');
      }
      updates.rejectReason = rejectReason;
      updates.refund = {
        status: 'PENDING',
        amountPaise: subOrder.subtotalPaise,
        cfRefundId: `ref_${subOrderId}_${now}`,
      };
    }

    await subOrderRef.update(updates);

    // Update parent order status and check points
    const parentOrderRef = db.collection('orders').doc(subOrder.orderId);
    const allSiblingSubOrdersSnap = await db
      .collection('subOrders')
      .where('orderId', '==', subOrder.orderId)
      .get();

    const siblingSubOrders = allSiblingSubOrdersSnap.docs.map((d) => d.data() as SubOrder);
    const derivedStatus = deriveParentOrderStatus(siblingSubOrders);

    await parentOrderRef.update({
      status: derivedStatus,
      updatedAt: now,
    });

    // If sub-order is COLLECTED, credit loyalty points
    if (targetStatus === 'COLLECTED') {
      const parentOrderDoc = await parentOrderRef.get();
      const parentOrder = parentOrderDoc.data();
      const dinerUid = parentOrder?.uid;

      if (dinerUid) {
        const points = calculatePointsEarned(subOrder.subtotalPaise);
        if (points > 0) {
          const ledgerRef = db.collection('pointsLedger').doc(`earn_${subOrderId}`);
          await ledgerRef.set(
            {
              uid: dinerUid,
              orderId: subOrder.orderId,
              subOrderId: subOrderId,
              type: 'earn',
              points,
              createdAt: now,
              notes: `Earned from ${subOrder.token}`,
            },
            { merge: true }
          );

          // Update user points balance
          await db
            .collection('users')
            .doc(dinerUid)
            .set(
              {
                pointsBalance: admin.firestore.FieldValue.increment(points),
                lifetimeSpendPaise: admin.firestore.FieldValue.increment(subOrder.subtotalPaise),
              },
              { merge: true }
            );
        }
      }
    }

    return {
      subOrderId,
      status: targetStatus,
      updatedAt: now,
    };
  }
);
