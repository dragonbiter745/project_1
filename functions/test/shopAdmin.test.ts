import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VendorMenu } from '@foodcourt/shared';
import { db } from '../src/db';
import { setAuthClient, shopAdmin } from '../src/callable/shopAdmin';
import { call, resetDb, seed, uniqueUid } from './helpers';

const rm = { role: 'vendorFinance', vendorId: 'v-rm', email: 'owner@rm.test' };
const photo = (vendorId: string, file = 'dish.jpg') => `https://firebasestorage.googleapis.com/v0/b/demo-foodcourt.appspot.com/o/menus%2F${vendorId}%2F${file}?alt=media&token=t`;
const menuOf = async (id = 'v-rm') => (await db.doc(`menus/${id}`).get()).data() as VendorMenu;
const act = (data: Record<string, unknown>, claims: Record<string, unknown> = rm) => call(shopAdmin, data, uniqueUid('owner'), claims);

describe('shop admin', () => {
  beforeEach(async () => {
    await resetDb();
    await seed({ paymentsEnabled: true });
  });

  it('lets only the shop admin login in, and only for its own shop', async () => {
    const edit = { action: 'DELETE_ITEM', itemId: 'rm-1' };
    await expect(act(edit, { role: 'vendorAdmin', vendorId: 'v-rm' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(act(edit, { role: 'vendorStaff', vendorId: 'v-rm' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call(shopAdmin, edit)).rejects.toMatchObject({ code: 'unauthenticated' });
    // Asking for another shop is ignored: the claim decides, so this edits Roll Me's own menu.
    await act({ ...edit, vendorId: 'v-sv' });
    expect((await menuOf('v-sv')).categories[0]!.items).toHaveLength(1);
    expect((await menuOf('v-rm')).categories[0]!.items.map((i) => i.id)).toEqual(['rm-2']);
    // The court manager names the shop.
    await act({ action: 'DELETE_ITEM', itemId: 'sv-1', vendorId: 'v-sv' }, { role: 'master' });
    expect((await menuOf('v-sv')).categories[0]!.items).toHaveLength(0);
    await expect(act(edit, { role: 'master' })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('adds a dish once however many times the button is tapped, and keeps an audit trail', async () => {
    const add = { action: 'SAVE_ITEM', requestKey: 'add-lemon-soda-1', categoryId: 'c', name: '  Lemon Soda ', pricePaise: 2500, veg: true, desc: 'Fresh' };
    await act(add);
    await act(add);
    const items = (await menuOf()).categories[0]!.items;
    expect(items.filter((i) => i.name === 'Lemon Soda')).toHaveLength(1);
    expect(items.find((i) => i.name === 'Lemon Soda')).toMatchObject({ pricePaise: 2500, veg: true, desc: 'Fresh' });
    expect((await menuOf()).version).toBeGreaterThanOrEqual(2);
    const logs = (await db.collection('auditLogs').where('vendorId', '==', 'v-rm').get()).docs.map((d) => d.data());
    expect(logs[0]).toMatchObject({ area: 'shop-admin', by: 'owner@rm.test', action: 'SAVE_ITEM' });
  });

  it('edits name, price and photo of a dish, and removing the photo clears it', async () => {
    const edit = { action: 'SAVE_ITEM', categoryId: 'c', itemId: 'rm-2', name: 'Double Egg Roll', pricePaise: 11000, veg: false };
    await act({ ...edit, requestKey: 'edit-egg-roll-1', imageUrl: photo('v-rm') });
    expect((await menuOf()).categories[0]!.items.find((i) => i.id === 'rm-2')).toMatchObject({ name: 'Double Egg Roll', pricePaise: 11000, veg: false, imageUrl: photo('v-rm') });
    await act({ ...edit, requestKey: 'edit-egg-roll-2', imageUrl: null });
    expect((await menuOf()).categories[0]!.items.find((i) => i.id === 'rm-2')!.imageUrl).toBeUndefined();
  });

  it('rejects prices outside ₹1 to ₹5,000, fractional paise, blank names and photos from elsewhere', async () => {
    const base = { action: 'SAVE_ITEM', requestKey: 'bad-input-0001', categoryId: 'c', itemId: 'rm-1', name: 'Paneer Roll', pricePaise: 12000, veg: true };
    for (const bad of [{ pricePaise: 0 }, { pricePaise: 99 }, { pricePaise: 500_001 }, { pricePaise: 120.5 }, { name: ' ' }]) {
      await expect(act({ ...base, ...bad })).rejects.toMatchObject({ code: 'invalid-argument' });
    }
    await expect(act({ ...base, imageUrl: 'https://evil.example/x.jpg' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(act({ ...base, imageUrl: photo('v-sv') })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await menuOf()).categories[0]!.items.find((i) => i.id === 'rm-1')!.pricePaise).toBe(12000);
  });

  it('removes a dish and its sold-out flag, and refuses to remove a section that still has dishes', async () => {
    await db.doc('availability/v-rm').update({ unavailable: { 'rm-1': true } });
    await act({ action: 'DELETE_ITEM', itemId: 'rm-1' });
    await act({ action: 'DELETE_ITEM', itemId: 'rm-1' }); // a repeat is fine
    expect((await db.doc('availability/v-rm').get()).data()!.unavailable).toEqual({});
    await expect(act({ action: 'DELETE_CATEGORY', categoryId: 'c' })).rejects.toMatchObject({ code: 'failed-precondition' });
    await act({ action: 'DELETE_ITEM', itemId: 'rm-2' });
    await act({ action: 'DELETE_CATEGORY', categoryId: 'c' });
    expect((await menuOf()).categories).toEqual([]);
  });

  it('adds and renames sections and puts dishes in a new order', async () => {
    await act({ action: 'SAVE_CATEGORY', requestKey: 'sec-drinks-0001', name: 'Drinks' });
    await act({ action: 'SAVE_CATEGORY', requestKey: 'sec-drinks-0001', name: 'Drinks' });
    let menu = await menuOf();
    expect(menu.categories.map((c) => c.name)).toEqual(['Main', 'Drinks']);
    const drinks = menu.categories[1]!.id;
    await act({ action: 'SAVE_CATEGORY', requestKey: 'sec-rename-0001', categoryId: drinks, name: 'Cold drinks' });
    await act({ action: 'REORDER', categoryId: 'c', ids: ['rm-2', 'rm-1'] });
    await act({ action: 'REORDER', ids: [drinks, 'c'] });
    menu = await menuOf();
    expect(menu.categories.map((c) => c.name)).toEqual(['Cold drinks', 'Main']);
    expect(menu.categories[1]!.items.map((i) => i.id)).toEqual(['rm-2', 'rm-1']);
  });

  it('moves a dish to another section when it is saved there', async () => {
    await act({ action: 'SAVE_CATEGORY', requestKey: 'sec-specials-01', name: 'Specials' });
    const specials = (await menuOf()).categories[1]!.id;
    await act({ action: 'SAVE_ITEM', requestKey: 'move-paneer-001', categoryId: specials, itemId: 'rm-1', name: 'Paneer Roll', pricePaise: 12000, veg: true });
    const menu = await menuOf();
    expect(menu.categories[0]!.items.map((i) => i.id)).toEqual(['rm-2']);
    expect(menu.categories[1]!.items.map((i) => i.id)).toEqual(['rm-1']);
  });

  it('saves shop settings and validates them', async () => {
    const settings = { action: 'UPDATE_SETTINGS', open: '08:30', close: '21:00', defaultPrepMin: 15, fulfilmentMode: 'table_service', logoUrl: photo('v-rm', 'logo.png') };
    await act(settings);
    expect((await db.doc('vendors/v-rm').get()).data()).toMatchObject({ hours: { open: '08:30', close: '21:00' }, defaultPrepMin: 15, fulfilmentMode: 'table_service', logoUrl: photo('v-rm', 'logo.png') });
    for (const bad of [{ open: '8:30' }, { close: '08:30' }, { defaultPrepMin: 0 }, { defaultPrepMin: 500 }, { logoUrl: 'https://evil.example/l.png' }]) {
      await expect(act({ ...settings, ...bad })).rejects.toMatchObject({ code: 'invalid-argument' });
    }
  });

  it('changes the password of this shop’s kitchen login only', async () => {
    const accounts: Record<string, { uid: string; customClaims: Record<string, unknown> }> = {
      'kitchen@rm.test': { uid: 'k-rm', customClaims: { role: 'vendorStaff', vendorId: 'v-rm' } },
      'kitchen@sv.test': { uid: 'k-sv', customClaims: { role: 'vendorStaff', vendorId: 'v-sv' } },
      'owner@rm.test': { uid: 'o-rm', customClaims: { role: 'vendorFinance', vendorId: 'v-rm' } },
    };
    const updateUser = vi.fn(async () => ({}));
    setAuthClient(
      () =>
        ({
          getUserByEmail: async (email: string) => {
            const a = accounts[email];
            if (!a) throw new Error('auth/user-not-found');
            return a;
          },
          updateUser,
        }) as never
    );

    const set = (kitchenEmail: string, password = 'Sunny-Day-42') => act({ action: 'SET_KITCHEN_PASSWORD', kitchenEmail, password });
    await set('Kitchen@RM.test ');
    expect(updateUser).toHaveBeenCalledWith('k-rm', { password: 'Sunny-Day-42' });
    // Another shop's kitchen, the owner's own admin login and an unknown email all look the same.
    for (const email of ['kitchen@sv.test', 'owner@rm.test', 'nobody@rm.test']) await expect(set(email)).rejects.toMatchObject({ code: 'not-found' });
    await expect(set('kitchen@rm.test', 'short')).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(updateUser).toHaveBeenCalledTimes(1);
    const logs = (await db.collection('auditLogs').where('action', '==', 'SET_KITCHEN_PASSWORD').get()).docs.map((d) => JSON.stringify(d.data()));
    expect(logs).toHaveLength(1);
    expect(logs[0]).not.toContain('Sunny-Day-42');
  });
});
