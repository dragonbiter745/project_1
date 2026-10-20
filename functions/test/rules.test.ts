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

  it('lets finance read money across shops but write nothing', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'payouts/p1'), { vendorId: 'v-rm', amountPaise: 500, status: 'RECORDED' }));
    const fin = env.authenticatedContext('fin', { role: 'finance' }).firestore();
    await assertSucceeds(getDoc(doc(fin, 'orders/o1')));
    await assertSucceeds(getDoc(doc(fin, 'subOrders/o1__v-rm')));
    await assertSucceeds(getDoc(doc(fin, 'payouts/p1')));
    await assertSucceeds(getDoc(doc(master(), 'payouts/p1')));
    await assertFails(getDoc(doc(staff(), 'payouts/p1')));
    await assertFails(getDoc(doc(diner(), 'payouts/p1')));
    await assertFails(setDoc(doc(fin, 'payouts/p2'), { vendorId: 'v-rm', amountPaise: 1 }));
    await assertFails(updateDoc(doc(master(), 'payouts/p1'), { amountPaise: 1 }));
    await assertFails(updateDoc(doc(fin, 'vendors/v-rm'), { feePct: 0 }));
    await assertFails(getDoc(doc(fin, 'tables/tbl-14')));
  });

  it('keeps menus and global config master-only', async () => {
    await assertFails(setDoc(doc(staff(), 'menus/v-rm'), { categories: [] }));
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'config/global')));
    await assertFails(updateDoc(doc(staff(), 'config/global'), { 'flags.maintenance': true }));
    await assertSucceeds(updateDoc(doc(master(), 'config/global'), { 'flags.maintenance': true }));
  });
});
