import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { StartSessionSchema, generateDisplayName, getIstDateKey } from '@foodcourt/shared';

import { db } from '../db';

export const startSession = onCall(
  {
    region: 'asia-south1',
    cors: true,
  },
  async (request) => {
    const parseResult = StartSessionSchema.safeParse(request.data);
    if (!parseResult.success) {
      throw new HttpsError('invalid-argument', parseResult.error.message);
    }

    const { tableCode } = parseResult.data;
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated (anonymous or logged in).');
    }

    // 1. Look up table by code
    const tablesSnap = await db
      .collection('tables')
      .where('code', '==', tableCode.trim())
      .where('active', '==', true)
      .limit(1)
      .get();

    if (tablesSnap.empty) {
      throw new HttpsError('not-found', `Table with code "${tableCode}" not found or inactive.`);
    }

    const tableDoc = tablesSnap.docs[0];
    const tableData = tableDoc.data();
    const dateKey = getIstDateKey();

    // 2. Check for active existing session for this user and table (3h TTL)
    const now = Date.now();
    const existingSessionSnap = await db
      .collection('sessions')
      .where('uid', '==', uid)
      .where('tableId', '==', tableDoc.id)
      .where('expiresAt', '>', now)
      .limit(1)
      .get();

    if (!existingSessionSnap.empty) {
      const sessionDoc = existingSessionSnap.docs[0];
      const sessionData = sessionDoc.data();
      // Update last active
      await sessionDoc.ref.update({ lastActiveAt: now });
      return {
        sessionId: sessionDoc.id,
        displayName: sessionData.displayName,
        dailyNo: sessionData.dailyNo,
        tableLabel: sessionData.tableLabel,
        tableId: tableDoc.id,
      };
    }

    // 3. Increment daily customer counter inside a Firestore transaction
    const counterRef = db.collection('counters').doc(dateKey);
    const sessionRef = db.collection('sessions').doc();

    const { dailyNo, displayName } = await db.runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      const currentNo = counterDoc.exists ? (counterDoc.data()?.customerCount || 0) : 0;
      const nextNo = currentNo + 1;

      transaction.set(
        counterRef,
        {
          customerCount: nextNo,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      const name = generateDisplayName(nextNo);
      const ttlMs = 3 * 60 * 60 * 1000; // 3 hours

      transaction.set(sessionRef, {
        uid,
        tableId: tableDoc.id,
        tableLabel: tableData.label,
        dateKey,
        dailyNo: nextNo,
        displayName: name,
        createdAt: now,
        lastActiveAt: now,
        expiresAt: now + ttlMs,
      });

      return { dailyNo: nextNo, displayName: name };
    });

    return {
      sessionId: sessionRef.id,
      displayName,
      dailyNo,
      tableLabel: tableData.label,
      tableId: tableDoc.id,
    };
  }
);
