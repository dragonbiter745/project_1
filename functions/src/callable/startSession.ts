import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { StartSessionSchema, generateDisplayName, getIstDateKey, type Table } from '@foodcourt/shared';
import { REGION, SESSION_TTL_MS } from '../config';
import { db } from '../db';
import { clientIp, limitLocal, limitShared, requireUid } from '../lib/guard';
import { signInProvider } from './account';

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Opens (or resumes) a diner's session at a table from the QR's unguessable token.
 * One session per diner per table per day, keyed deterministically: no global counter to contend on.
 */
export const startSession = onCall({ region: REGION, minInstances: 1, maxInstances: 100, concurrency: 80, timeoutSeconds: 20 }, async (req) => {
  const uid = requireUid(req);
  limitLocal(`ip:${clientIp(req)}:session`, 900, 60);
  await limitShared(`session:${uid}`, 30, 600);

  const parsed = StartSessionSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid table code.');

  const found = await db.collection('tables').where('qrToken', '==', parsed.data.qrToken).limit(1).get();
  const tableDoc = found.docs[0];
  const table = tableDoc?.data() as Table | undefined;
  if (!tableDoc || !table?.active) {
    throw new HttpsError('not-found', 'This QR code is no longer valid. Ask the staff for help or scan another table.');
  }

  const now = Date.now();
  const dateKey = getIstDateKey();
  const sessionRef = db.collection('sessions').doc(`${uid}_${tableDoc.id}_${dateKey}`);
  const counterRef = db.collection('counters').doc(`${dateKey}_${tableDoc.id}`);
  // Signed-in diners are called by their own name; guests get a generated one.
  const provider = signInProvider(req);
  const memberName = provider && provider !== 'anonymous' ? ((await db.collection('users').doc(uid).get()).data()?.name as string | undefined) : undefined;

  return db.runTransaction(async (tx) => {
    const [existing, counter] = await Promise.all([tx.get(sessionRef), tx.get(counterRef)]);
    if (existing.exists && (existing.data()!.expiresAt as number) > now) {
      tx.update(sessionRef, { lastActiveAt: now, expiresAt: now + SESSION_TTL_MS, expireAt: Timestamp.fromMillis(now + SESSION_TTL_MS + 86_400_000) });
      const s = existing.data()!;
      return { sessionId: sessionRef.id, tableId: tableDoc.id, tableLabel: s.tableLabel, displayName: s.displayName, dailyNo: s.dailyNo };
    }
    // Per-table daily number (a few diners a day per table, so no contention).
    const dailyNo = ((counter.data()?.count as number | undefined) ?? 0) + 1;
    const displayName = memberName || generateDisplayName(hashSeed(uid));
    tx.set(counterRef, { count: dailyNo, updatedAt: now }, { merge: true });
    tx.set(sessionRef, {
      uid,
      tableId: tableDoc.id,
      tableLabel: table.label,
      qrToken: parsed.data.qrToken,
      dateKey,
      dailyNo,
      displayName,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + SESSION_TTL_MS,
      // TTL policy field: Firestore deletes the session a day after it ends.
      expireAt: Timestamp.fromMillis(now + SESSION_TTL_MS + 86_400_000),
    });
    return { sessionId: sessionRef.id, tableId: tableDoc.id, tableLabel: table.label, displayName, dailyNo };
  });
});
