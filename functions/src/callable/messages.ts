import * as crypto from 'crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import type { Query } from 'firebase-admin/firestore';
import {
  CampaignActionSchema,
  LAPSED_DAYS,
  PushActionSchema,
  REGULAR_VISITS,
  categoryKey,
  normaliseCode,
  type Campaign,
  type CampaignAudience,
  type CampaignStats,
  type CustomerRecord,
  type UserProfile,
} from '@foodcourt/shared';
import { CUSTOMER_URL, REGION } from '../config';
import { db } from '../db';
import { limitLocal, limitShared, requireUid, roleOf } from '../lib/guard';
import { sendPush, tokenDocId, tokensFor } from '../lib/push';

const DAY = 86_400_000;
/** A campaign reaches at most this many diners; the court has far fewer. */
const MAX_RECIPIENTS = 5000;
const ANNOUNCEMENT_DAYS = 3;

// ─── Phones that allowed notifications ──────────────────────────────────────

/** A diner's phone allowed notifications (or stopped). Guests too: order-ready alerts help everyone. */
export const pushAction = onCall({ region: REGION, maxInstances: 30, concurrency: 80, timeoutSeconds: 20 }, async (req) => {
  const uid = requireUid(req);
  limitLocal(`push:${uid}`, 20, 600);
  const parsed = PushActionSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid notification token.');
  const ref = db.collection('pushTokens').doc(tokenDocId(parsed.data.token));
  const now = Date.now();
  if (parsed.data.action === 'UNREGISTER') {
    const snap = await ref.get();
    if (snap.exists && snap.data()!.uid === uid) await ref.delete();
    return { ok: true };
  }
  // A token belongs to one browser; if someone else signs in on it, it moves to them.
  await ref.set({ uid, token: parsed.data.token, updatedAt: now, createdAt: now }, { merge: true });
  return { ok: true };
});

// ─── Who a campaign reaches ─────────────────────────────────────────────────

type Row = Pick<CustomerRecord, 'uid' | 'member' | 'visits' | 'firstSeenAt' | 'lastSeenAt'>;

async function rows(q: Query): Promise<Row[]> {
  const snap = await q.select('member', 'visits', 'firstSeenAt', 'lastSeenAt').limit(MAX_RECIPIENTS * 2).get();
  return snap.docs.map((d) => ({ ...(d.data() as Row), uid: d.id }));
}

/** Signed-in diners a customer audience means, from the per-diner summaries. */
export async function resolveDiners(a: Exclude<CampaignAudience, { kind: 'KITCHENS' }>, now = Date.now()): Promise<string[]> {
  const customers = db.collection('customers');
  let list: Row[];
  switch (a.kind) {
    case 'PEOPLE':
      return [...new Set(a.uids)].slice(0, MAX_RECIPIENTS);
    case 'SHOP':
      list = await rows(customers.where(`byVendor.${a.vendorId}.orders`, '>', 0));
      break;
    case 'CATEGORY':
      list = await rows(customers.where(`byCategory.${categoryKey(a.vendorId, a.categoryId)}.qty`, '>', 0));
      break;
    default:
      list = await rows(customers.where('member', '==', true));
  }
  const keep = (c: Row) => {
    if (!c.member) return false;
    if (a.kind === 'REGULARS') return (c.visits ?? 0) >= REGULAR_VISITS && now - (c.lastSeenAt ?? 0) <= LAPSED_DAYS * DAY;
    if (a.kind === 'NEW') return now - (c.firstSeenAt ?? 0) <= 7 * DAY;
    if (a.kind === 'LAPSED') return now - (c.lastSeenAt ?? now) > LAPSED_DAYS * DAY;
    return true;
  };
  return list.filter(keep).map((c) => c.uid).slice(0, MAX_RECIPIENTS);
}

/** Of these diners, the ones who agreed to offers (push goes only to them). */
async function consenting(uids: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < uids.length; i += 300) {
    const snaps = await db.getAll(...uids.slice(i, i + 300).map((u) => db.collection('users').doc(u)));
    for (const s of snaps) if ((s.data() as Partial<UserProfile> | undefined)?.prefs?.offers === true) out.push(s.id);
  }
  return out;
}

async function kitchenCount(vendorIds: string[]): Promise<number> {
  return vendorIds.includes('ALL') ? (await db.collection('vendors').count().get()).data().count : vendorIds.length;
}

export async function estimateAudience(a: CampaignAudience): Promise<{ recipients: number; pushTargets: number }> {
  if (a.kind === 'KITCHENS') return { recipients: await kitchenCount(a.vendorIds), pushTargets: 0 };
  const uids = await resolveDiners(a);
  const withPhone = new Set((await tokensFor(await consenting(uids))).map((t) => t.uid));
  return { recipients: uids.length, pushTargets: withPhone.size };
}

// ─── Delivery ───────────────────────────────────────────────────────────────

/** Sends one campaign, once: the SCHEDULED → SENDING claim means a retry or a second sweeper skips it. */
export async function deliverCampaign(id: string, now = Date.now()): Promise<CampaignStats | null> {
  const ref = db.collection('campaigns').doc(id);
  const campaign = await db.runTransaction(async (tx) => {
    const c = (await tx.get(ref)).data() as Campaign | undefined;
    if (!c || c.status !== 'SCHEDULED' || c.sendAt > now) return null;
    tx.update(ref, { status: 'SENDING', claimedAt: now });
    return { ...c, id };
  });
  if (!campaign) return null;

  try {
    const stats: CampaignStats = { recipients: 0, inbox: 0, pushTargets: 0, pushSent: 0, pushFailed: 0 };
    const a = campaign.audience;
    if (a.kind === 'KITCHENS') {
      const audience = a.vendorIds.includes('ALL') ? ['ALL'] : a.vendorIds;
      await db.collection('announcements').doc(id).set({ title: campaign.title, body: campaign.body, audience, createdAt: now, expiresAt: now + ANNOUNCEMENT_DAYS * DAY, campaignId: id });
      stats.recipients = await kitchenCount(a.vendorIds);
    } else {
      const uids = await resolveDiners(a, now);
      stats.recipients = uids.length;
      // Everyone targeted gets it in their in-app inbox; ids are deterministic so a retry rewrites, never doubles.
      for (let i = 0; i < uids.length; i += 400) {
        const chunk = uids.slice(i, i + 400);
        const batch = db.batch();
        for (const uid of chunk) {
          batch.set(db.collection('inbox').doc(`${id}_${uid}`), {
            uid,
            campaignId: id,
            title: campaign.title,
            body: campaign.body,
            ...(campaign.couponCode ? { couponCode: campaign.couponCode } : {}),
            createdAt: now,
          });
        }
        await batch.commit();
        stats.inbox += chunk.length;
      }
      const tokens = await tokensFor(await consenting(uids));
      stats.pushTargets = new Set(tokens.map((t) => t.uid)).size;
      if (tokens.length > 0) {
        const link = `${CUSTOMER_URL.value()}/?inbox=${encodeURIComponent(id)}`;
        const result = await sendPush(tokens, { title: campaign.title, body: campaign.body, link, tag: `campaign-${id}` });
        stats.pushSent = result.sent;
        stats.pushFailed = result.failed;
      }
    }
    await ref.update({ status: 'SENT', sentAt: Date.now(), stats });
    return stats;
  } catch (err) {
    logger.error('Campaign delivery failed', { id, err: (err as Error).message });
    await ref.update({ status: 'FAILED', error: (err as Error).message.slice(0, 300) });
    throw err;
  }
}

export const campaignAction = onCall({ region: REGION, maxInstances: 5, timeoutSeconds: 300, memory: '512MiB' }, async (req) => {
  const uid = requireUid(req);
  if (roleOf(req).role !== 'master') throw new HttpsError('permission-denied', 'Only the court manager can send messages.');
  await limitShared(`campaign:${uid}`, 60, 300);
  const parsed = CampaignActionSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Check the message.');
  const input = parsed.data;
  const by = typeof req.auth?.token.email === 'string' ? req.auth.token.email : uid;
  const now = Date.now();

  if (input.action === 'ESTIMATE') return estimateAudience(input.audience);

  if (input.action === 'CANCEL') {
    const ref = db.collection('campaigns').doc(input.campaignId);
    await db.runTransaction(async (tx) => {
      const c = (await tx.get(ref)).data() as Campaign | undefined;
      if (!c) throw new HttpsError('not-found', 'No such message.');
      if (c.status !== 'SCHEDULED') throw new HttpsError('failed-precondition', 'Only scheduled messages can be cancelled.');
      tx.update(ref, { status: 'CANCELLED', cancelledAt: now, cancelledBy: by });
    });
    return { campaignId: input.campaignId, status: 'CANCELLED' };
  }

  const couponCode = input.couponCode ? normaliseCode(input.couponCode) : undefined;
  if (couponCode && input.audience.kind === 'KITCHENS') throw new HttpsError('invalid-argument', 'Kitchen announcements cannot carry a coupon.');
  if (couponCode && !(await db.collection('coupons').doc(couponCode).get()).exists) throw new HttpsError('not-found', `No coupon called ${couponCode}.`);
  if (input.sendAt && input.sendAt < now - 60_000) throw new HttpsError('invalid-argument', 'Pick a time in the future to schedule.');

  // Same person + same form submission → same campaign, so a double tap sends once.
  const id = 'c' + crypto.createHash('sha256').update(`${uid}:${input.requestKey}`).digest('hex').slice(0, 20);
  const ref = db.collection('campaigns').doc(id);
  const campaign: Omit<Campaign, 'id'> = {
    title: input.title,
    body: input.body,
    audience: input.audience,
    ...(couponCode ? { couponCode } : {}),
    status: 'SCHEDULED',
    sendAt: input.sendAt ?? now,
    createdAt: now,
    createdBy: by,
  };
  try {
    await ref.create(campaign);
  } catch (err) {
    if ((err as { code?: number }).code !== 6) throw err; // ALREADY_EXISTS: a repeat of the same send
    return { campaignId: id, duplicate: true };
  }
  await db.collection('auditLogs').add({ at: now, by, area: 'messages', action: input.sendAt ? 'SCHEDULE' : 'SEND', campaignId: id, audience: input.audience.kind });
  if (input.sendAt && input.sendAt > now + 60_000) return { campaignId: id, scheduled: true };
  const stats = await deliverCampaign(id, Math.max(now, input.sendAt ?? now));
  return { campaignId: id, stats };
});

/** Sends scheduled messages when their time comes. */
export const campaignSweeper = onSchedule({ schedule: 'every 5 minutes', region: REGION, timeZone: 'Asia/Kolkata', timeoutSeconds: 300, memory: '512MiB' }, async () => {
  const now = Date.now();
  const due = await db.collection('campaigns').where('status', '==', 'SCHEDULED').where('sendAt', '<=', now).limit(10).get();
  for (const d of due.docs) {
    try {
      await deliverCampaign(d.id, now);
    } catch {
      // Logged in deliverCampaign; the rest still go.
    }
  }
});
