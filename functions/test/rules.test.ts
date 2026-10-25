import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-foodcourt-rules',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firebase/firestore.rules'), 'utf8'), host: host!, port: Number(port) },
  });
});
afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tables/tbl-14'), { label: 'T-14', active: true, qrToken: 'secret-token-abcdefghijk' });
    await setDoc(doc(db, 'vendors/v-rm'), { name: 'Roll Me', acceptingOrders: true, defaultPrepMin: 10, status: 'active', feePct: 3 });
    await setDoc(doc(db, 'availability/v-rm'), { vendorId: 'v-rm', unavailable: {}, updatedAt: 1 });
    await setDoc(doc(db, 'menus/v-rm'), { vendorId: 'v-rm', version: 1, categories: [] });
    await setDoc(doc(db, 'venues/venue-reva'), { name: 'Court' });
    await setDoc(doc(db, 'publicCatalog/status'), { v: 'x' });
    await setDoc(doc(db, 'orders/o1'), { uid: 'alice', totals: { totalPaise: 100 } });
    await setDoc(doc(db, 'subOrders/o1__v-rm'), { uid: 'alice', orderId: 'o1', vendorId: 'v-rm', dateKey: '2026-10-20', status: 'NEW' });
    await setDoc(doc(db, 'config/global'), { flags: { maintenance: false } });
  });
});

const diner = (uid = 'alice') => env.authenticatedContext(uid).firestore();
const staff = (vendorId = 'v-rm') => env.authenticatedContext(`staff-${vendorId}`, { role: 'vendorStaff', vendorId }).firestore();
const master = () => env.authenticatedContext('boss', { role: 'master' }).firestore();

describe('firestore.rules', () => {
  it('keeps the secret table QR tokens away from everyone but the master', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'tables/tbl-14')));
    await assertFails(getDoc(doc(diner(), 'tables/tbl-14')));
    await assertFails(getDocs(collection(diner(), 'tables')));
    await assertSucceeds(getDoc(doc(master(), 'tables/tbl-14')));
  });

  it('lets diners read only their own orders and tickets', async () => {
    await assertSucceeds(getDoc(doc(diner(), 'orders/o1')));
    await assertSucceeds(getDocs(query(collection(diner(), 'subOrders'), where('uid', '==', 'alice'), where('orderId', '==', 'o1'))));
    await assertFails(getDoc(doc(diner('mallory'), 'orders/o1')));
    await assertFails(getDoc(doc(diner('mallory'), 'subOrders/o1__v-rm')));
  });

  it('scopes kitchens to their own shop', async () => {
    await assertSucceeds(getDocs(query(collection(staff(), 'subOrders'), where('vendorId', '==', 'v-rm'), where('dateKey', '==', '2026-10-20'))));
    await assertFails(getDocs(query(collection(staff('v-sv'), 'subOrders'), where('vendorId', '==', 'v-rm'))));
  });

  it('never lets a client write orders, tickets, sessions or issues', async () => {
    await assertFails(setDoc(doc(diner(), 'orders/o2'), { uid: 'alice' }));
    await assertFails(updateDoc(doc(diner(), 'subOrders/o1__v-rm'), { status: 'COLLECTED' }));
    await assertFails(updateDoc(doc(staff(), 'subOrders/o1__v-rm'), { status: 'COLLECTED' }));
    await assertFails(setDoc(doc(diner(), 'sessions/s1'), { uid: 'alice' }));
    await assertFails(setDoc(doc(diner(), 'issues/i1'), { text: 'spam' }));
    await assertFails(setDoc(doc(diner(), 'rateLimits/x'), { n: 0 }));
  });

  it('lets a kitchen toggle its own stock and pause, nothing more', async () => {
    await assertSucceeds(setDoc(doc(staff(), 'availability/v-rm'), { vendorId: 'v-rm', unavailable: { 'rm-1': true }, updatedAt: 2 }));
    await assertFails(setDoc(doc(staff('v-sv'), 'availability/v-rm'), { vendorId: 'v-rm', unavailable: {}, updatedAt: 2 }));
    await assertFails(setDoc(doc(staff(), 'availability/v-rm'), { vendorId: 'v-rm', unavailable: {}, updatedAt: 2, extra: 1 }));
    await assertSucceeds(updateDoc(doc(staff(), 'vendors/v-rm'), { acceptingOrders: false, pausedUntil: '2026-10-20T13:00:00Z' }));
    await assertFails(updateDoc(doc(staff(), 'vendors/v-rm'), { feePct: 0 }));
    await assertFails(updateDoc(doc(staff(), 'vendors/v-rm'), { defaultPrepMin: 999 }));
  });

  it("lets a shop's finance login read its own money, nothing else, and write nothing", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'payouts/p1'), { vendorId: 'v-rm', amountPaise: 500, status: 'RECORDED' });
      await setDoc(doc(ctx.firestore(), 'payouts/p2'), { vendorId: 'v-sv', amountPaise: 700, status: 'RECORDED' });
    });
    const fin = env.authenticatedContext('fin-rm', { role: 'vendorFinance', vendorId: 'v-rm' }).firestore();
    await assertSucceeds(getDoc(doc(fin, 'subOrders/o1__v-rm')));
    await assertSucceeds(getDocs(query(collection(fin, 'payouts'), where('vendorId', '==', 'v-rm'))));
    await assertFails(getDoc(doc(fin, 'payouts/p2')));
    await assertFails(getDocs(collection(fin, 'payouts')));
    await assertFails(getDoc(doc(fin, 'orders/o1')));
    await assertFails(getDoc(doc(fin, 'tables/tbl-14')));
    await assertFails(setDoc(doc(fin, 'payouts/p3'), { vendorId: 'v-rm', amountPaise: 1 }));
    await assertFails(updateDoc(doc(fin, 'vendors/v-rm'), { feePct: 0 }));
    // A kitchen login of the same shop never sees money records.
    await assertFails(getDoc(doc(staff(), 'payouts/p1')));
    await assertFails(getDoc(doc(diner(), 'payouts/p1')));
    await assertSucceeds(getDoc(doc(master(), 'payouts/p2')));
    await assertFails(updateDoc(doc(master(), 'payouts/p1'), { amountPaise: 1 }));
    await assertFails(getDoc(doc(env.authenticatedContext('old', { role: 'finance' }).firestore(), 'orders/o1')));
  });

  it('keeps the founder books to the court manager', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'founderLedger/f1'), { kind: 'CAPITAL', amountPaise: 100, status: 'RECORDED' }));
    await assertSucceeds(getDoc(doc(master(), 'founderLedger/f1')));
    await assertFails(getDoc(doc(staff(), 'founderLedger/f1')));
    await assertFails(getDoc(doc(env.authenticatedContext('fin-rm', { role: 'vendorFinance', vendorId: 'v-rm' }).firestore(), 'founderLedger/f1')));
    await assertFails(getDoc(doc(diner(), 'founders/partners')));
    await assertFails(setDoc(doc(master(), 'founderLedger/f2'), { kind: 'DRAWING', amountPaise: 1 }));
  });

  it('shows customer analytics to the court manager and a diner only their own summary', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'customers/alice'), { uid: 'alice', visits: 3, orders: 2, lastSeenAt: 1 });
      await setDoc(doc(ctx.firestore(), 'visits/alice_2026-10-20'), { uid: 'alice', dateKey: '2026-10-20', first: true });
    });
    await assertSucceeds(getDoc(doc(master(), 'customers/alice')));
    await assertSucceeds(getDocs(collection(master(), 'customers')));
    await assertSucceeds(getDoc(doc(diner(), 'customers/alice')));
    await assertFails(getDoc(doc(diner('bob'), 'customers/alice')));
    await assertFails(getDocs(collection(diner(), 'customers')));
    await assertFails(getDoc(doc(staff(), 'customers/alice')));
    await assertFails(setDoc(doc(diner(), 'customers/alice'), { visits: 999 }));
    await assertFails(setDoc(doc(master(), 'customers/alice'), { visits: 999 }));
    await assertSucceeds(getDoc(doc(master(), 'visits/alice_2026-10-20')));
    await assertFails(getDoc(doc(diner(), 'visits/alice_2026-10-20')));
  });

  it('keeps coupon terms and usage away from diners and kitchens', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'coupons/SECRET50'), { code: 'SECRET50', showInWallet: false, active: true });
      await setDoc(doc(ctx.firestore(), 'couponUses/SECRET50_alice'), { count: 1 });
      await setDoc(doc(ctx.firestore(), 'couponHolds/SECRET50_alice'), { orderId: 'o1' });
    });
    await assertSucceeds(getDoc(doc(master(), 'coupons/SECRET50')));
    await assertFails(getDoc(doc(diner(), 'coupons/SECRET50')));
    await assertFails(getDocs(collection(diner(), 'coupons')));
    await assertFails(getDoc(doc(staff(), 'coupons/SECRET50')));
    await assertFails(setDoc(doc(master(), 'coupons/FREE'), { code: 'FREE', flatPaise: 100000 }));
    await assertFails(updateDoc(doc(master(), 'coupons/SECRET50'), { usedCount: 0 }));
    await assertFails(getDoc(doc(diner(), 'couponUses/SECRET50_alice')));
    await assertFails(getDoc(doc(master(), 'couponHolds/SECRET50_alice')));
  });

  it("lets a diner read and mark only their own inbox, and keeps tokens and campaigns server-side", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'inbox/c1_alice'), { uid: 'alice', campaignId: 'c1', title: 'Hi', body: 'Offer', createdAt: 1 });
      await setDoc(doc(db, 'pushTokens/t1'), { uid: 'alice', token: 'secret' });
      await setDoc(doc(db, 'campaigns/c1'), { title: 'Hi', status: 'SENT' });
      await setDoc(doc(db, 'announcements/a1'), { title: 'Gas check', audience: ['ALL'], createdAt: 1 });
    });
    await assertSucceeds(getDoc(doc(diner(), 'inbox/c1_alice')));
    await assertSucceeds(getDocs(query(collection(diner(), 'inbox'), where('uid', '==', 'alice'))));
    await assertFails(getDoc(doc(diner('bob'), 'inbox/c1_alice')));
    await assertSucceeds(updateDoc(doc(diner(), 'inbox/c1_alice'), { readAt: 5 }));
    await assertFails(updateDoc(doc(diner(), 'inbox/c1_alice'), { title: 'Free food' }));
    await assertFails(updateDoc(doc(diner('bob'), 'inbox/c1_alice'), { readAt: 6 }));
    await assertFails(setDoc(doc(diner(), 'inbox/c2_alice'), { uid: 'alice', title: 'Fake' }));
    await assertFails(getDoc(doc(diner(), 'pushTokens/t1')));
    await assertFails(getDoc(doc(master(), 'pushTokens/t1')));
    await assertFails(getDoc(doc(diner(), 'campaigns/c1')));
    await assertSucceeds(getDoc(doc(master(), 'campaigns/c1')));
    await assertSucceeds(getDoc(doc(staff(), 'announcements/a1')));
    await assertFails(getDoc(doc(diner(), 'announcements/a1')));
  });

  it('keeps menus and global config master-only', async () => {
    await assertFails(setDoc(doc(staff(), 'menus/v-rm'), { categories: [] }));
    // The shop admin login edits its menu and settings only through the shopAdmin callable.
    const owner = env.authenticatedContext('fin-rm', { role: 'vendorFinance', vendorId: 'v-rm' }).firestore();
    await assertFails(setDoc(doc(owner, 'menus/v-rm'), { categories: [] }));
    await assertFails(updateDoc(doc(owner, 'vendors/v-rm'), { defaultPrepMin: 5 }));
    await assertFails(updateDoc(doc(owner, 'availability/v-rm'), { unavailable: {} }));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'config/global')));
    await assertSucceeds(getDoc(doc(staff(), 'config/global')));
    await assertFails(updateDoc(doc(staff(), 'config/global'), { 'flags.maintenance': true }));
    await assertSucceeds(updateDoc(doc(master(), 'config/global'), { 'flags.maintenance': true }));
  });

  it('keeps the shop catalogue off the public internet, because every read is billed to the project', async () => {
    const nobody = env.unauthenticatedContext().firestore();
    for (const ctx of [nobody, diner()]) {
      await assertFails(getDoc(doc(ctx, 'vendors/v-rm')));
      await assertFails(getDocs(collection(ctx, 'vendors')));
      await assertFails(getDocs(query(collection(ctx, 'vendors'), where('status', '==', 'active'))));
      await assertFails(getDoc(doc(ctx, 'menus/v-rm')));
      await assertFails(getDoc(doc(ctx, 'availability/v-rm')));
      await assertFails(getDoc(doc(ctx, 'config/global')));
      await assertFails(getDoc(doc(ctx, 'venues/venue-reva')));
    }
    // A kitchen sees its own shop only; a shop admin the same; the court manager everything.
    await assertSucceeds(getDoc(doc(staff(), 'vendors/v-rm')));
    await assertSucceeds(getDoc(doc(staff(), 'menus/v-rm')));
    await assertSucceeds(getDoc(doc(staff(), 'availability/v-rm')));
    await assertFails(getDoc(doc(staff('v-sv'), 'menus/v-rm')));
    await assertFails(getDoc(doc(staff('v-sv'), 'vendors/v-rm')));
    await assertFails(getDocs(collection(staff(), 'vendors')));
    const fin = env.authenticatedContext('fin-rm', { role: 'vendorFinance', vendorId: 'v-rm' }).firestore();
    await assertSucceeds(getDoc(doc(fin, 'menus/v-rm')));
    await assertSucceeds(getDoc(doc(fin, 'config/global')));
    await assertFails(getDoc(doc(fin, 'menus/v-sv')));
    await assertSucceeds(getDocs(query(collection(master(), 'vendors'), where('status', 'in', ['active', 'inactive', 'suspended']))));
    await assertSucceeds(getDoc(doc(master(), 'venues/venue-reva')));
    // The cached copy the /api endpoints serve is for the server alone.
    for (const ctx of [nobody, diner(), staff(), master()]) {
      await assertFails(getDoc(doc(ctx, 'publicCatalog/status')));
      await assertFails(setDoc(doc(ctx, 'publicCatalog/status'), { v: 'hacked' }));
    }
  });
});
