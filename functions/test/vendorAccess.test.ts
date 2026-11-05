import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db';
import { completeInvite, inspectInvite, setAccessAuthClient, vendorAccess } from '../src/callable/vendorAccess';
import { setMailSender, type Mail } from '../src/lib/mailer';
import { call, resetDb, seed } from './helpers';

const master = { role: 'master' };

interface FakeUser {
  uid: string;
  email: string;
  password?: string;
  customClaims?: Record<string, unknown>;
  disabled: boolean;
  emailVerified: boolean;
  metadata: { lastSignInTime?: string };
}
let users: Map<string, FakeUser>;
let sent: Mail[];
let n = 0;

const fakeAuth = () => ({
  getUserByEmail: async (email: string) => {
    const u = [...users.values()].find((x) => x.email === email);
    if (!u) throw new Error('auth/user-not-found');
    return u as never;
  },
  getUser: async (uid: string) => {
    const u = users.get(uid);
    if (!u) throw new Error('auth/user-not-found');
    return u as never;
  },
  createUser: async (p: { email: string; password: string }) => {
    const u: FakeUser = { uid: `u${++n}`, email: p.email, password: p.password, disabled: false, emailVerified: false, metadata: {} };
    users.set(u.uid, u);
    return u as never;
  },
  updateUser: async (uid: string, p: { password?: string; disabled?: boolean; emailVerified?: boolean }) => {
    const u = users.get(uid)!;
    Object.assign(u, p);
    return u as never;
  },
  setCustomUserClaims: async (uid: string, c: Record<string, unknown>) => {
    users.get(uid)!.customClaims = c;
  },
  deleteUser: async (uid: string) => {
    users.delete(uid);
  },
  listUsers: async () => ({ users: [...users.values()] as never[], pageToken: undefined }),
  revokeRefreshTokens: async () => {},
});

const act = (data: unknown, claims: Record<string, unknown> = master) => call(vendorAccess, data, 'm1', claims);
const tokenFrom = (mail: Mail) => new URL(mail.text.match(/https?:\/\/\S+/)![0]).searchParams.get('t')!;
const invite = (email = 'owner@shopmail.com', vendorId = 'v-rm', role = 'vendorAdmin') => act({ action: 'INVITE', email, vendorId, role });

async function fresh() {
  await resetDb();
  await seed({ paymentsEnabled: true });
  users = new Map();
  sent = [];
  setAccessAuthClient(fakeAuth);
  setMailSender(async (m) => {
    sent.push(m);
  });
}

describe('vendor logins by email', () => {
  beforeEach(fresh);

  it('is for the court manager only', async () => {
    await expect(act({ action: 'LIST' }, { role: 'vendorAdmin', vendorId: 'v-rm' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call(vendorAccess, { action: 'LIST' })).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('creates the login and emails a link; the link is stored only as a hash', async () => {
    const { uid } = await invite('Owner@ShopMail.com');
    const u = users.get(uid)!;
    expect(u.email).toBe('owner@shopmail.com');
    expect(u.customClaims).toEqual({ role: 'vendorAdmin', vendorId: 'v-rm' });
    expect(u.password!.length).toBeGreaterThan(20); // a random password nobody sees

    expect(sent).toHaveLength(1);
    const mail = sent[0]!;
    expect(mail.to).toBe('owner@shopmail.com');
    expect(mail.subject).toContain('Roll Me');
    expect(mail.html).toContain('https://brand.example.test/qrave-wordmark.png');
    expect(mail.html).toContain('Set my password');
    expect(mail.html).toContain('/set-password?t=');
    const token = tokenFrom(mail);
    expect(JSON.stringify((await db.collection('invites').get()).docs.map((d) => d.data()))).not.toContain(token);
  });

  it('sends finance logins to shop admin and kitchen logins to the kitchen display', async () => {
    await invite('fin@shopmail.com', 'v-rm', 'vendorFinance');
    await invite('kit@shopmail.com', 'v-rm', 'vendorStaff');
    expect(sent[0]!.text).toContain('https://shopadmin.example.test/set-password?t=');
    expect(sent[1]!.text).toContain('https://kitchen.example.test/set-password?t=');
  });

  it('lets the person choose a password once, and the link then stops working', async () => {
    const { uid } = await invite();
    const token = tokenFrom(sent[0]!);
    expect(await call(inspectInvite, { token })).toMatchObject({ email: 'owner@shopmail.com', shopName: 'Roll Me', app: 'kitchen' });

    await expect(call(completeInvite, { token, password: 'short1' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call(completeInvite, { token, password: 'onlylettersnonumber' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call(completeInvite, { token, password: 'owner@shopmail.com' })).rejects.toMatchObject({ code: 'invalid-argument' });

    await call(completeInvite, { token, password: 'MyOwn-Secret-42' });
    expect(users.get(uid)!.password).toBe('MyOwn-Secret-42');
    expect(users.get(uid)!.emailVerified).toBe(true);

    await expect(call(completeInvite, { token, password: 'Another-Secret-7' })).rejects.toMatchObject({ code: 'not-found' });
    await expect(call(inspectInvite, { token })).rejects.toMatchObject({ code: 'not-found' });
    expect(users.get(uid)!.password).toBe('MyOwn-Secret-42');
  });

  it('refuses expired links and made-up tokens with the same message', async () => {
    await invite();
    const token = tokenFrom(sent[0]!);
    const doc = (await db.collection('invites').get()).docs[0]!;
    await doc.ref.update({ expiresAt: Date.now() - 1000 });
    await expect(call(completeInvite, { token, password: 'MyOwn-Secret-42' })).rejects.toMatchObject({ code: 'not-found' });
    await expect(call(completeInvite, { token: 'x'.repeat(43), password: 'MyOwn-Secret-42' })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('a new link replaces the old one', async () => {
    const { uid } = await invite();
    const first = tokenFrom(sent[0]!);
    await act({ action: 'RESEND', uid });
    const second = tokenFrom(sent[1]!);
    expect(second).not.toBe(first);
    await expect(call(completeInvite, { token: first, password: 'MyOwn-Secret-42' })).rejects.toMatchObject({ code: 'not-found' });
    await call(completeInvite, { token: second, password: 'MyOwn-Secret-42' });
  });

  it('after the password is set, a resend is a reset email', async () => {
    const { uid } = await invite();
    await call(completeInvite, { token: tokenFrom(sent[0]!), password: 'MyOwn-Secret-42' });
    await act({ action: 'RESEND', uid });
    expect(sent[1]!.subject).toContain('Reset your Qrave password');
    expect(sent[1]!.html).toContain('Choose new password');
  });

  it('will not hand a shop login to someone else’s account', async () => {
    users.set('d1', { uid: 'd1', email: 'diner@x.example', disabled: false, emailVerified: true, metadata: {} });
    users.set('mm', { uid: 'mm', email: 'boss@x.example', customClaims: { role: 'master' }, disabled: false, emailVerified: true, metadata: {} });
    users.set('o2', { uid: 'o2', email: 'sv@x.example', customClaims: { role: 'vendorAdmin', vendorId: 'v-sv' }, disabled: false, emailVerified: true, metadata: {} });
    await expect(invite('diner@x.example')).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(invite('boss@x.example')).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(invite('sv@x.example')).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(invite('nobody@x.example', 'no-such-shop')).rejects.toMatchObject({ code: 'not-found' });
    expect(sent).toHaveLength(0);
  });

  it('limits how often one address can be emailed', async () => {
    const { uid } = await invite();
    for (let i = 0; i < 4; i++) await act({ action: 'RESEND', uid });
    await expect(act({ action: 'RESEND', uid })).rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  it('does not email stand-in addresses', async () => {
    users.set('k1', { uid: 'k1', email: 'kitchen-rm@foodcourt.local', customClaims: { role: 'vendorStaff', vendorId: 'v-rm' }, disabled: false, emailVerified: true, metadata: {} });
    await expect(act({ action: 'RESEND', uid: 'k1' })).rejects.toMatchObject({ code: 'failed-precondition' });
    const list = await act({ action: 'LIST' });
    expect(list.logins).toEqual([expect.objectContaining({ email: 'kitchen-rm@foodcourt.local', status: 'active', placeholder: true })]);
  });

  it('does not call a login active just because Firebase reports a sign-in time', async () => {
    // A brand-new account already carries a "last sign-in" in Firebase; only setting a password makes it active.
    const { uid } = await invite();
    users.get(uid)!.metadata.lastSignInTime = new Date().toUTCString();
    const row = (await act({ action: 'LIST' })).logins[0];
    expect(row.status).toBe('invited');
    expect(row.lastSignInAt).toBeUndefined();
  });

  it('lists invited and active logins, and switching one off blocks its link', async () => {
    const { uid } = await invite();
    expect((await act({ action: 'LIST' })).logins[0]).toMatchObject({ status: 'invited', placeholder: false });
    const token = tokenFrom(sent[0]!);
    await act({ action: 'SET_ENABLED', uid, enabled: false });
    expect((await act({ action: 'LIST' })).logins[0].status).toBe('disabled');
    await expect(call(completeInvite, { token, password: 'MyOwn-Secret-42' })).rejects.toMatchObject({ code: 'not-found' });
    await act({ action: 'SET_ENABLED', uid, enabled: true });
    await call(completeInvite, { token, password: 'MyOwn-Secret-42' });
    expect((await act({ action: 'LIST' })).logins[0].status).toBe('active');
  });

  it('removes a login and its pending link', async () => {
    const { uid } = await invite();
    await act({ action: 'REMOVE_LOGIN', uid });
    expect(users.size).toBe(0);
    expect((await db.collection('invites').get()).empty).toBe(true);
    await expect(call(completeInvite, { token: tokenFrom(sent[0]!), password: 'MyOwn-Secret-42' })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('writes an audit trail with no secrets in it', async () => {
    await invite();
    const logs = (await db.collection('auditLogs').where('area', '==', 'vendor-access').get()).docs.map((d) => JSON.stringify(d.data())).join(' ');
    expect(logs).toContain('SEND_INVITE');
    expect(logs).not.toContain(tokenFrom(sent[0]!));
  });
});

describe('adding and removing shops', () => {
  beforeEach(fresh);
  const shop = { action: 'CREATE_SHOP', requestKey: 'shop-key-0001', name: 'Dosa Corner', code: 'dc' };

  it('adds a paused shop with an empty menu, and a double tap lands once', async () => {
    const res = await act(shop);
    expect(res.vendorId).toBe('vendor-dosa-corner');
    const v = (await db.doc('vendors/vendor-dosa-corner').get()).data()!;
    expect(v).toMatchObject({ name: 'Dosa Corner', code: 'DC', status: 'active', acceptingOrders: false, feePct: 3, hours: { open: '09:00', close: '21:00' } });
    expect((await db.doc('menus/vendor-dosa-corner').get()).data()).toMatchObject({ categories: [] });
    expect((await act(shop)).vendorId).toBe(res.vendorId);
    expect((await db.collection('vendors').where('code', '==', 'DC').get()).size).toBe(1);
  });

  it('refuses a duplicate name or token code', async () => {
    await act(shop);
    await expect(act({ ...shop, requestKey: 'shop-key-0002' })).rejects.toMatchObject({ code: 'already-exists' });
    await expect(act({ ...shop, requestKey: 'shop-key-0003', name: 'Another One', code: 'RM' })).rejects.toMatchObject({ code: 'already-exists' });
    await expect(act({ ...shop, requestKey: 'shop-key-0004', name: 'Other', code: 'x' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('removes a shop with no history, with its logins, only when the name is typed right', async () => {
    await act(shop);
    await act({ action: 'INVITE', email: 'dc@shopmail.com', vendorId: 'vendor-dosa-corner', role: 'vendorAdmin' });
    await expect(act({ action: 'DELETE_SHOP', vendorId: 'vendor-dosa-corner', confirmName: 'Wrong' })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await db.doc('vendors/vendor-dosa-corner').get()).exists).toBe(true);

    const res = await act({ action: 'DELETE_SHOP', vendorId: 'vendor-dosa-corner', confirmName: 'dosa corner' });
    expect(res).toMatchObject({ removed: true, archived: false, logins: 1 });
    expect((await db.doc('vendors/vendor-dosa-corner').get()).exists).toBe(false);
    expect((await db.doc('menus/vendor-dosa-corner').get()).exists).toBe(false);
    expect(users.size).toBe(0);
  });

  it('switches off, rather than erases, a shop that has order history', async () => {
    await db.doc('subOrders/s1').set({ vendorId: 'v-rm', status: 'COLLECTED' });
    users.set('o1', { uid: 'o1', email: 'rm@x.example', customClaims: { role: 'vendorAdmin', vendorId: 'v-rm' }, disabled: false, emailVerified: true, metadata: {} });
    const res = await act({ action: 'DELETE_SHOP', vendorId: 'v-rm', confirmName: 'Roll Me' });
    expect(res).toMatchObject({ removed: false, archived: true, logins: 1 });
    expect((await db.doc('vendors/v-rm').get()).data()).toMatchObject({ status: 'suspended', acceptingOrders: false });
    expect((await db.doc('subOrders/s1').get()).exists).toBe(true);
    expect(users.size).toBe(0);
  });
});
