import * as crypto from 'crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { AdminActionSchema } from '@foodcourt/shared';
import { REGION } from '../config';
import { db } from '../db';
import { limitShared, requireUid, roleOf } from '../lib/guard';

/** 128 random bits, URL-safe: the QR link cannot be guessed from the table number. */
export const newQrToken = () => crypto.randomBytes(16).toString('base64url');

export const adminAction = onCall({ region: REGION, maxInstances: 10, timeoutSeconds: 60 }, async (req) => {
  const uid = requireUid(req);
  if (roleOf(req).role !== 'master') throw new HttpsError('permission-denied', 'Only the court manager can do this.');
  await limitShared(`admin:${uid}`, 60, 300);
  const parsed = AdminActionSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid action.');
  const input = parsed.data;

  if (input.action === 'ENSURE_QR_TOKENS') {
    const tables = await db.collection('tables').get();
    const missing = tables.docs.filter((d) => !d.data().qrToken);
    for (let i = 0; i < missing.length; i += 400) {
      const batch = db.batch();
      for (const d of missing.slice(i, i + 400)) batch.update(d.ref, { qrToken: newQrToken(), qrUpdatedAt: Date.now() });
      await batch.commit();
    }
    return { updated: missing.length, total: tables.size };
  }

  const ref = db.collection('tables').doc(input.tableId);
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'No such table.');
  const qrToken = newQrToken();
  await ref.update({ qrToken, qrUpdatedAt: Date.now() });
  return { tableId: input.tableId, qrToken };
});
