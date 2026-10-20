import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Message } from 'firebase-admin/messaging';
import { db } from '../src/db';
import { startSession } from '../src/callable/startSession';
import { createCheckout } from '../src/callable/createCheckout';
import { vendorAction } from '../src/callable/vendorAction';
import { campaignAction, deliverCampaign, pushAction } from '../src/callable/messages';
import { notifyTicket } from '../src/triggers/notify';
import { setPushSender } from '../src/lib/push';
import { call, resetDb, seed, sessionFor, uniqueUid } from './helpers';

const master = { role: 'master', email: 'boss@example.test' };
const DAY = 86_400_000;
let sent: Message[] = [];

beforeEach(() => {
  sent = [];
  setPushSender(async (messages) => {
    sent.push(...messages);
    // One dead token, to check it gets cleaned up.
    return messages.map((m) => ((m as { token: string }).token === 'dead-token-xxxxxxxxxxxx' ? { ok: false, code: 'messaging/registration-token-not-registered' } : { ok: true }));
  });
});
afterEach(() => setPushSender(null));

async function diner(opts: { member?: boolean; offers?: boolean; visits?: number; lastSeenAgoDays?: number; firstSeenAgoDays?: number; byVendor?: Record<string, unknown>; token?: string }) {
  const uid = uniqueUid();
  const now = Date.now();
  await db.doc(`customers/${uid}`).set({
    uid,
    member: opts.member ?? true,
    visits: opts.visits ?? 1,
    orders: 1,
    spendPaise: 10000,
    firstSeenAt: now - (opts.firstSeenAgoDays ?? 20) * DAY,
    lastSeenAt: now - (opts.lastSeenAgoDays ?? 1) * DAY,
    ...(opts.byVendor ? { byVendor: opts.byVendor } : {}),
  });
  await db.doc(`users/${uid}`).set({ member: opts.member ?? true, prefs: { offers: opts.offers ?? false, orderUpdates: true } });
  if (opts.token) await call(pushAction, { action: 'REGISTER', token: opts.token }, uid);
  return uid;
}

const send = (key: string, extra: Record<string, unknown>) =>
  call(campaignAction, { action: 'SEND', requestKey: key, title: 'Diwali week', body: 'Lamps, sweets and a treat.', audience: { kind: 'MEMBERS' }, ...extra }, 'boss', master);

describe('pushAction', () => {
  beforeEach(resetDb);

  it('stores one record per phone and lets only its owner remove it', async () => {
    const uid = uniqueUid();
    const token = 'tok-aaaaaaaaaaaaaaaaaaaaaaaa';
    await call(pushAction, { action: 'REGISTER', token }, uid);
    await call(pushAction, { action: 'REGISTER', token }, uid);
    expect((await db.collection('pushTokens').where('uid', '==', uid).get()).size).toBe(1);
    await call(pushAction, { action: 'UNREGISTER', token }, uniqueUid());
    expect((await db.collection('pushTokens').where('uid', '==', uid).get()).size).toBe(1);
    await call(pushAction, { action: 'UNREGISTER', token }, uid);
    expect((await db.collection('pushTokens').where('uid', '==', uid).get()).size).toBe(0);
    await expect(call(pushAction, { action: 'REGISTER', token: 'short' }, uid)).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('campaigns', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: true });
  });

  it('is for the court manager only', async () => {
    await expect(call(campaignAction, { action: 'ESTIMATE', audience: { kind: 'MEMBERS' } }, uniqueUid())).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('puts it in every targeted inbox, and pushes only to diners who agreed to offers', async () => {
    const agreed = await diner({ offers: true, token: 'tok-agreed-aaaaaaaaaaaaaaaa' });
    const silent = await diner({ offers: false, token: 'tok-silent-aaaaaaaaaaaaaaaa' });
    const noPhone = await diner({ offers: true });
    await diner({ member: false, offers: true, token: 'tok-guest-aaaaaaaaaaaaaaaaa' });

    expect(await call(campaignAction, { action: 'ESTIMATE', audience: { kind: 'MEMBERS' } }, 'boss', master)).toEqual({ recipients: 3, pushTargets: 1 });

    const res = await send('send-key-0001', {});
    expect(res.stats).toEqual({ recipients: 3, inbox: 3, pushTargets: 1, pushSent: 1, pushFailed: 0 });
    expect(sent).toHaveLength(1);
    expect((sent[0] as { data: Record<string, string> }).data).toMatchObject({ title: 'Diwali week', link: expect.stringContaining('?inbox=') });

    const inbox = await db.collection('inbox').where('campaignId', '==', res.campaignId).get();
    expect(inbox.docs.map((d) => d.data().uid).sort()).toEqual([agreed, silent, noPhone].sort());
    expect((await db.doc(`campaigns/${res.campaignId}`).get()).data()).toMatchObject({ status: 'SENT', createdBy: 'boss@example.test' });

    // A double tap sends once.
    expect(await send('send-key-0001', {})).toMatchObject({ duplicate: true });
    expect(sent).toHaveLength(1);
  });

  it('targets regulars, new, lapsed and people who ordered from a shop', async () => {
    const regular = await diner({ visits: 5, lastSeenAgoDays: 2 });
    const fresh = await diner({ firstSeenAgoDays: 2, lastSeenAgoDays: 0 });
    await diner({ lastSeenAgoDays: 45 });
    await diner({ byVendor: { 'v-rm': { orders: 3, spendPaise: 36000 } } });
    const estimate = async (audience: unknown) => (await call(campaignAction, { action: 'ESTIMATE', audience }, 'boss', master)).recipients;
    expect(await estimate({ kind: 'REGULARS' })).toBe(1);
    expect(await estimate({ kind: 'NEW' })).toBe(1);
    expect(await estimate({ kind: 'LAPSED' })).toBe(1);
    expect(await estimate({ kind: 'SHOP', vendorId: 'v-rm' })).toBe(1);
    expect(await estimate({ kind: 'PEOPLE', uids: [regular, fresh, fresh] })).toBe(2);
  });

  it('can carry a coupon, and refuses one that does not exist', async () => {
    await diner({});
    await db.doc('coupons/TREAT20').set({ code: 'TREAT20', active: true });
    await expect(send('send-key-0002', { couponCode: 'NOPE' })).rejects.toMatchObject({ code: 'not-found' });
    const ok = await send('send-key-0003', { couponCode: 'treat20' });
    const msg = (await db.collection('inbox').where('campaignId', '==', ok.campaignId).get()).docs[0]!.data();
    expect(msg.couponCode).toBe('TREAT20');
  });

  it('schedules for later, sends once when due, and can be cancelled before that', async () => {
    await diner({});
    const later = Date.now() + 2 * 3_600_000;
    const res = await send('send-key-0004', { sendAt: later });
    expect(res).toMatchObject({ scheduled: true });
    expect(await deliverCampaign(res.campaignId)).toBeNull();
    expect(await deliverCampaign(res.campaignId, later + 1)).toMatchObject({ inbox: 1 });
    expect(await deliverCampaign(res.campaignId, later + 2)).toBeNull();

    const other = await send('send-key-0005', { sendAt: later });
    await call(campaignAction, { action: 'CANCEL', campaignId: other.campaignId }, 'boss', master);
    expect(await deliverCampaign(other.campaignId, later + 1)).toBeNull();
    await expect(call(campaignAction, { action: 'CANCEL', campaignId: res.campaignId }, 'boss', master)).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('posts announcements to kitchens instead of diners', async () => {
    const res = await send('send-key-0006', { title: 'Gas check at 4', body: 'Please switch off burners at 4pm.', audience: { kind: 'KITCHENS', vendorIds: ['ALL'] } });
    expect(res.stats).toMatchObject({ recipients: 2, inbox: 0 });
    expect((await db.doc(`announcements/${res.campaignId}`).get()).data()).toMatchObject({ title: 'Gas check at 4', audience: ['ALL'] });
  });
});

describe('order update notifications', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: false });
  });

  it("tells the diner's phone when food is ready, and removes dead tokens", async () => {
    const uid = uniqueUid();
    const sessionId = await sessionFor(startSession, uid);
    await call(pushAction, { action: 'REGISTER', token: 'tok-phone-aaaaaaaaaaaaaaaaa' }, uid);
    await call(pushAction, { action: 'REGISTER', token: 'dead-token-xxxxxxxxxxxx' }, uid);
    const items = [{ itemId: 'rm-1', vendorId: 'v-rm', name: 'Paneer Roll', pricePaise: 1, veg: true, qty: 1 }];
    const { orderId } = await call(createCheckout, { sessionId, checkoutKey: 'notify-key-01', items }, uid);
    const ticketId = `${orderId}__v-rm`;
    const ticket = async () => (await db.doc(`subOrders/${ticketId}`).get()).data() as never;
    const staff = { role: 'vendorStaff', vendorId: 'v-rm' };

    await call(vendorAction, { subOrderId: ticketId, action: 'ACCEPT' }, 'staff-rm', staff);
    expect(await notifyTicket(ticketId, await ticket())).toBe('quiet');
    await call(vendorAction, { subOrderId: ticketId, action: 'READY' }, 'staff-rm', staff);
    expect(await notifyTicket(ticketId, await ticket())).toBe('sent');
    expect(sent).toHaveLength(2);
    expect((sent[0] as { data: Record<string, string> }).data).toMatchObject({ title: 'Roll Me: your food is ready', tag: ticketId, link: expect.stringContaining(`order_id=${orderId}`) });
    expect((await db.collection('pushTokens').where('uid', '==', uid).get()).size).toBe(1);

    await db.doc(`users/${uid}`).set({ prefs: { orderUpdates: false } }, { merge: true });
    expect(await notifyTicket(ticketId, await ticket())).toBe('off');
  });
});
