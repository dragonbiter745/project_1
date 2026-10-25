import * as zlib from 'zlib';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db';
import { catalog, forgetCatalogMemory, onFlagsChanged, onMenuChanged, onShopChanged, onStockChanged } from '../src/catalog';
import { rebuildAll, refreshData } from '../src/lib/catalog';
import { httpCall, resetDb, seed } from './helpers';

const get = (path: string, query: Record<string, string> = {}, headers: Record<string, string> = {}) => httpCall(catalog as any, { path, query, headers });
const json = (r: { payload: unknown }) => JSON.parse(typeof r.payload === 'string' ? r.payload : zlib.gunzipSync(r.payload as Buffer).toString());
const trigger = (fn: any, id: string, before: any, after: any) =>
  fn.run({ params: { id }, data: { before: { exists: before !== null, data: () => before }, after: { exists: after !== null, data: () => after } } });

beforeEach(async () => {
  await resetDb();
  await seed({ paymentsEnabled: true });
  forgetCatalogMemory();
});

describe('catalogue copies', () => {
  it('builds shops, menus, stock and flags from the source documents', async () => {
    const data = await rebuildAll();
    expect(data.vendors.map((v) => v.id).sort()).toEqual(['v-rm', 'v-sv']);
    expect(Object.keys(data.menus).sort()).toEqual(['v-rm', 'v-sv']);
    // Moving parts stay out of the heavy document.
    expect((data.vendors[0] as any).acceptingOrders).toBeUndefined();
    const status = (await db.doc('publicCatalog/status').get()).data()!;
    expect(status.v).toBe(data.v);
    expect(status.vendors['v-rm']).toEqual({ acceptingOrders: true });
    expect(status.availability['v-sv'].unavailable).toEqual({});
    expect(status.config.flags.paymentsEnabled).toBe(true);
  });

  it('only rewrites the heavy document when shops or menus really changed', async () => {
    await rebuildAll();
    expect(await refreshData()).toBe(false);
    await db.doc('menus/v-rm').update({ categories: [{ id: 'c', name: 'Main', items: [{ id: 'rm-9', name: 'New Roll', pricePaise: 5000, veg: true }] }] });
    expect(await refreshData()).toBe(true);
    const next = (await db.doc('publicCatalog/data').get()).data()!;
    expect(next.menus['v-rm'].categories[0].items[0].name).toBe('New Roll');
    expect((await db.doc('publicCatalog/status').get()).data()!.v).toBe(next.v);
  });
});

describe('triggers keep the copies current with one small write', () => {
  beforeEach(async () => {
    await rebuildAll();
  });

  it('replaces a shop\'s stock map instead of merging into it, so restocking sticks', async () => {
    await db.doc('availability/v-rm').set({ vendorId: 'v-rm', unavailable: { 'rm-1': true, 'rm-2': true }, updatedAt: 1 });
    await trigger(onStockChanged, 'v-rm', null, {});
    expect((await db.doc('publicCatalog/status').get()).data()!.availability['v-rm'].unavailable).toEqual({ 'rm-1': true, 'rm-2': true });
    await db.doc('availability/v-rm').set({ vendorId: 'v-rm', unavailable: { 'rm-2': true }, updatedAt: 2 });
    await trigger(onStockChanged, 'v-rm', {}, {});
    expect((await db.doc('publicCatalog/status').get()).data()!.availability['v-rm'].unavailable).toEqual({ 'rm-2': true });
  });

  it('a pause changes the small status only; a rename rebuilds the catalogue', async () => {
    const v1 = (await db.doc('publicCatalog/data').get()).data()!.v;
    const before = (await db.doc('vendors/v-rm').get()).data()!;
    await db.doc('vendors/v-rm').update({ acceptingOrders: false });
    await trigger(onShopChanged, 'v-rm', before, { ...before, acceptingOrders: false });
    expect((await db.doc('publicCatalog/status').get()).data()!.vendors['v-rm'].acceptingOrders).toBe(false);
    expect((await db.doc('publicCatalog/data').get()).data()!.v).toBe(v1);

    const paused = { ...before, acceptingOrders: false };
    await db.doc('vendors/v-rm').update({ name: 'Roll Me Express' });
    await trigger(onShopChanged, 'v-rm', paused, { ...paused, name: 'Roll Me Express' });
    const data = (await db.doc('publicCatalog/data').get()).data()!;
    expect(data.v).not.toBe(v1);
    expect(data.vendors.find((v: any) => v.id === 'v-rm').name).toBe('Roll Me Express');
  });

  it('a menu edit and a flag change reach the copies', async () => {
    const v1 = (await db.doc('publicCatalog/data').get()).data()!.v;
    await db.doc('menus/v-sv').update({ categories: [{ id: 'c', name: 'Main', items: [{ id: 'sv-1', name: 'Masala Dosa', pricePaise: 7500, veg: true }] }] });
    await trigger(onMenuChanged, 'v-sv', {}, {});
    expect((await db.doc('publicCatalog/data').get()).data()!.v).not.toBe(v1);

    await db.doc('config/global').update({ 'flags.paymentsEnabled': false });
    await trigger(onFlagsChanged, 'global', {}, {});
    expect((await db.doc('publicCatalog/status').get()).data()!.config.flags.paymentsEnabled).toBe(false);
  });

  it('rebuilds everything if the status document went missing', async () => {
    await db.doc('publicCatalog/status').delete();
    await db.doc('availability/v-rm').set({ vendorId: 'v-rm', unavailable: { 'rm-1': true }, updatedAt: 3 });
    await trigger(onStockChanged, 'v-rm', null, {});
    const status = (await db.doc('publicCatalog/status').get()).data()!;
    expect(status.availability['v-rm'].unavailable).toEqual({ 'rm-1': true });
    expect(Object.keys(status.vendors).sort()).toEqual(['v-rm', 'v-sv']);
  });
});

describe('GET /api/status and /api/catalog', () => {
  it('serves the small status briefly and builds the copies on the very first request', async () => {
    const res = await get('/api/status', {}, { 'accept-encoding': 'gzip' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=15, s-maxage=30');
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.headers.vary).toBe('Accept-Encoding');
    expect(json(res).vendors['v-rm']).toBeDefined();
  });

  it('caches a catalogue URL for a day only when its version is the current one', async () => {
    const { v } = json(await get('/api/status'));
    const good = await get('/api/catalog', { v });
    expect(good.headers['cache-control']).toContain('immutable');
    expect(json(good).v).toBe(v);
    const stale = await get('/api/catalog', { v: 'old-version' });
    expect(stale.headers['cache-control']).toBe('public, max-age=30, s-maxage=30');
    const bare = await get('/api/catalog');
    expect(bare.headers['cache-control']).toBe('public, max-age=30, s-maxage=30');
  });

  it('sends plain JSON to a client that cannot gzip, and refuses everything else', async () => {
    const plain = await get('/api/status');
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(typeof plain.payload).toBe('string');
    expect((await httpCall(catalog as any, { method: 'POST', path: '/api/status' })).status).toBe(405);
    expect((await get('/api/secrets')).status).toBe(404);
  });

  it('reads the database once, however many requests arrive', async () => {
    await get('/api/status');
    await db.doc('publicCatalog/status').update({ marker: 'changed-behind-the-cache' });
    expect(json(await get('/api/status')).marker).toBeUndefined();
  });
});
