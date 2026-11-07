import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { PICKUP_TABLE_ID, PICKUP_TABLE_LABEL, StartPickupSessionSchema, StartSessionSchema, generateDisplayName, getIstDateKey, type Table } from '@foodcourt/shared';
import { REGION, SESSION_TTL_MS, APP_CHECK_ENFORCE } from '../config';
import { db } from '../db';
import { clientIp, limitLocal, requireUid } from '../lib/guard';
import { customerRef, writeVisit } from '../lib/customers';
import { retryContention } from '../lib/orders';
import { signInProvider } from './account';

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The diner's number at this table today ("Diner #12"). It is cosmetic, so it uses a lock-free increment
 * outside any transaction: a crowd scanning one QR at the same moment (a demo screen) never queues on it.
 */
async function takeDailyNo(counterRef: DocumentReference, now: number): Promise<number> {
  await counterRef.set({ count: FieldValue.increment(1), updatedAt: now }, { merge: true });
  return ((await counterRef.get()).data()?.count as number | undefined) ?? 1;
}

/**
 * Opens (or resumes) a diner's session at a table from the QR's unguessable token, or a signed-in
 * diner's pickup session for ordering on the website.
 * One session per diner per table per day, keyed deterministically: no global counter to contend on.
 */
export const startSession = onCall({ region: REGION, enforceAppCheck: APP_CHECK_ENFORCE, maxInstances: 100, concurrency: 80, timeoutSeconds: 20 }, async (req) => {
  const uid = requireUid(req);
  limitLocal(`ip:${clientIp(req)}:session`, 900, 60);
  limitLocal(`session:${uid}`, 30, 600);

  // Website orders have no table: any diner, signed in or a guest, gets a pickup session and collects at the counter.
  const pickup = StartPickupSessionSchema.safeParse(req.data).success;
  const provider = signInProvider(req);
  const member = Boolean(provider && provider !== 'anonymous');
  let tableId: string;
  let tableLabel: string;
  let qrToken: string | undefined;
  if (pickup) {
    tableId = PICKUP_TABLE_ID;
    tableLabel = PICKUP_TABLE_LABEL;
  } else {
    const parsed = StartSessionSchema.safeParse(req.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid table code.');
    const found = await db.collection('tables').where('qrToken', '==', parsed.data.qrToken).limit(1).get();
    const tableDoc = found.docs[0];
    const table = tableDoc?.data() as Table | undefined;
    if (!tableDoc || !table?.active) {
      throw new HttpsError('not-found', 'This QR code is no longer valid. Ask the staff for help or scan another table.');
    }
    tableId = tableDoc.id;
    tableLabel = table.label;
    qrToken = parsed.data.qrToken;
  }

  const now = Date.now();
  const dateKey = getIstDateKey();
  const sessionRef = db.collection('sessions').doc(`${uid}_${tableId}_${dateKey}`);
  const counterRef = db.collection('counters').doc(`${dateKey}_${tableId}`);
  // Signed-in diners are called by their own name; guests get a generated one.
  const memberName = member ? ((await db.collection('users').doc(uid).get()).data()?.name as string | undefined) : undefined;

  const before = await sessionRef.get();
  const resuming = before.exists && (before.data()!.expiresAt as number) > now;
  const takenNo = resuming ? 0 : await takeDailyNo(counterRef, now);

  return retryContention(() =>
    db.runTransaction(async (tx) => {
      const [existing, customer] = await Promise.all([tx.get(sessionRef), tx.get(customerRef(uid))]);
      if (existing.exists && (existing.data()!.expiresAt as number) > now) {
        const s = existing.data()!;
        // A diner who signed in after scanning is called by their own name from now on.
        const displayName = memberName || (s.displayName as string);
        tx.update(sessionRef, { lastActiveAt: now, expiresAt: now + SESSION_TTL_MS, expireAt: Timestamp.fromMillis(now + SESSION_TTL_MS + 86_400_000), displayName });
        writeVisit(tx, customer, { uid, dateKey, now, displayName, member });
        return { sessionId: sessionRef.id, tableId, tableLabel: s.tableLabel, displayName, dailyNo: s.dailyNo };
      }
      // Taken above, before the transaction; a race that lost to a resume above may skip one number, which is harmless.
      const dailyNo = takenNo || 1;
      const displayName = memberName || generateDisplayName(hashSeed(uid));
      writeVisit(tx, customer, { uid, dateKey, now, displayName, member });
      tx.set(sessionRef, {
        uid,
        tableId,
        tableLabel,
        ...(qrToken ? { qrToken } : {}),
        dateKey,
        dailyNo,
        displayName,
        createdAt: now,
        lastActiveAt: now,
        expiresAt: now + SESSION_TTL_MS,
        // TTL policy field: Firestore deletes the session a day after it ends.
        expireAt: Timestamp.fromMillis(now + SESSION_TTL_MS + 86_400_000),
      });
      return { sessionId: sessionRef.id, tableId, tableLabel, displayName, dailyNo };
    })
  );
});
