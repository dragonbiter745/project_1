import * as crypto from 'crypto';
import { getMessaging, type Message } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions/v2';
import { app, db } from '../db';

// Web push through Firebase Cloud Messaging. Messages are data-only, so the customer app's service
// worker decides how a notification looks and where a tap goes. Dead tokens are removed on send.

export const tokenDocId = (token: string) => crypto.createHash('sha256').update(token).digest('hex').slice(0, 40);

export interface PushPayload {
  title: string;
  body: string;
  /** Where a tap opens (same site). */
  link: string;
  /** Notifications with the same tag replace each other (one per ticket). */
  tag?: string;
}

export type PushSender = (messages: Message[]) => Promise<Array<{ ok: boolean; code?: string }>>;

const fcmSender: PushSender = async (messages) => {
  const res = await getMessaging(app).sendEach(messages);
  return res.responses.map((r) => ({ ok: r.success, code: r.error?.code }));
};

let sender: PushSender = fcmSender;

/** Tests swap in a fake so nothing ever reaches the real FCM. */
export function setPushSender(next: PushSender | null): void {
  sender = next ?? fcmSender;
}

const DEAD = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

export async function tokensFor(uids: string[]): Promise<Array<{ id: string; uid: string; token: string }>> {
  const out: Array<{ id: string; uid: string; token: string }> = [];
  for (let i = 0; i < uids.length; i += 30) {
    const snap = await db.collection('pushTokens').where('uid', 'in', uids.slice(i, i + 30)).get();
    for (const d of snap.docs) out.push({ id: d.id, uid: d.data().uid as string, token: d.data().token as string });
  }
  return out;
}

export async function sendPush(tokens: Array<{ id: string; token: string }>, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    const messages: Message[] = chunk.map((t) => ({
      token: t.token,
      data: { title: payload.title, body: payload.body, link: payload.link, tag: payload.tag ?? '' },
      webpush: { headers: { Urgency: 'high', TTL: '3600' } },
    }));
    try {
      const results = await sender(messages);
      const dead: string[] = [];
      results.forEach((r, k) => {
        if (r.ok) sent++;
        else {
          failed++;
          if (r.code && DEAD.has(r.code)) dead.push(chunk[k]!.id);
        }
      });
      if (dead.length > 0) {
        const batch = db.batch();
        for (const id of dead) batch.delete(db.collection('pushTokens').doc(id));
        await batch.commit();
      }
    } catch (err) {
      failed += chunk.length;
      logger.error('Push send failed', { err: (err as Error).message, count: chunk.length });
    }
  }
  return { sent, failed };
}
