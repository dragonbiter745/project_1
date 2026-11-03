import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, deleteObject } from 'firebase/storage';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = process.env.FIREBASE_STORAGE_EMULATOR_HOST!.split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-foodcourt-storage',
    storage: { rules: readFileSync(resolve(__dirname, '../../firebase/storage.rules'), 'utf8'), host: host!, port: Number(port) },
  });
});
afterAll(() => env.cleanup());

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const as = (uid: string, claims?: Record<string, unknown>) => (claims ? env.authenticatedContext(uid, claims) : env.authenticatedContext(uid)).storage();
const shopAdmin = (vendorId = 'v-rm') => as(`fin-${vendorId}`, { role: 'vendorFinance', vendorId });

describe('storage.rules', () => {
  it('lets nobody write to the unused public/ folder, not even the court manager', async () => {
    await assertFails(uploadBytes(ref(as('boss', { role: 'master' }), 'public/x.jpg'), jpeg, { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(as('k', { role: 'vendorAdmin', vendorId: 'v-rm' }), 'public/page.html'), jpeg, { contentType: 'text/html' }));
  });

  it("lets a shop's admin login upload a small photo for its own shop only", async () => {
    await assertSucceeds(uploadBytes(ref(shopAdmin(), 'menus/v-rm/dish.jpg'), jpeg, { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(shopAdmin('v-other'), 'menus/v-rm/dish2.jpg'), jpeg, { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(as('k', { role: 'vendorStaff', vendorId: 'v-rm' }), 'menus/v-rm/dish3.jpg'), jpeg, { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(as('alice'), 'menus/v-rm/dish4.jpg'), jpeg, { contentType: 'image/jpeg' }));
    await assertFails(deleteObject(ref(shopAdmin('v-other'), 'menus/v-rm/dish.jpg')));
  });

  it('refuses files that are not images, and images of 1 MB or more', async () => {
    await assertFails(uploadBytes(ref(shopAdmin(), 'menus/v-rm/page.html'), jpeg, { contentType: 'text/html' }));
    await assertFails(uploadBytes(ref(shopAdmin(), 'menus/v-rm/logo.svg'), jpeg, { contentType: 'image/svg+xml' }));
    await assertFails(uploadBytes(ref(shopAdmin(), 'menus/v-rm/big.jpg'), new Uint8Array(1024 * 1024), { contentType: 'image/jpeg' }));
  });
});
