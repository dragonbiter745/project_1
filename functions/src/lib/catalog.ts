import * as crypto from 'crypto';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import type { CatalogData, CatalogStatus, CatalogVendor, GlobalConfig, VendorMenu } from '@foodcourt/shared';
import { db } from '../db';

/**
 * Server-built copies of the public catalogue. Diners read these through the CDN (see catalog.ts), so
 * what the database is asked depends on how often the catalogue changes, never on how many phones are
 * open. `data` is the heavy part (shops and menus) and `status` the small part that moves during
 * service (stock, pauses, flags).
 */
const collection = () => db.collection('publicCatalog');
export const dataRef = () => collection().doc('data');
export const statusRef = () => collection().doc('status');

/** Shop fields that change during service; they travel in `status` so a pause never re-sends every menu. */
const VOLATILE = ['acceptingOrders', 'pausedUntil', 'updatedAt'] as const;

type Fields = Record<string, unknown>;

const sortKeys = (_key: string, value: unknown): unknown =>
  value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value as Fields).sort(([a], [b]) => (a < b ? -1 : 1))) : value;

/** A short fingerprint of some JSON; equal content always gives the same version. */
export const versionOf = (value: unknown): string => crypto.createHash('sha1').update(JSON.stringify(value, sortKeys)).digest('hex').slice(0, 12);

export function staticVendor(id: string, data: Fields): CatalogVendor {
  const rest: Fields = { ...data };
  for (const key of VOLATILE) delete rest[key];
  return { ...rest, id } as unknown as CatalogVendor;
}

export function volatileVendor(data: Fields): { acceptingOrders?: boolean; pausedUntil?: number | null } {
  const out: { acceptingOrders?: boolean; pausedUntil?: number | null } = {};
  if (typeof data.acceptingOrders === 'boolean') out.acceptingOrders = data.acceptingOrders;
  if (data.pausedUntil === null || typeof data.pausedUntil === 'number') out.pausedUntil = data.pausedUntil;
  return out;
}

export type { CatalogData, CatalogStatus, CatalogVendor };

const nameOf = (v: { name?: string }) => v.name ?? '';

export async function buildData(): Promise<CatalogData> {
  const snap = await db.collection('vendors').where('status', '==', 'active').get();
  const vendors = snap.docs.map((d) => staticVendor(d.id, d.data())).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const menuSnaps = vendors.length ? await db.getAll(...vendors.map((v) => db.collection('menus').doc(v.id))) : [];
  const menus: Record<string, VendorMenu> = {};
  for (const m of menuSnaps) if (m.exists) menus[m.id] = m.data() as VendorMenu;
  return { v: versionOf({ vendors, menus }), builtAt: Date.now(), vendors, menus };
}

export async function buildStatus(v: string): Promise<CatalogStatus> {
  const [vendors, availability, config] = await Promise.all([
    db.collection('vendors').where('status', '==', 'active').get(),
    db.collection('availability').get(),
    db.collection('config').doc('global').get(),
  ]);
  return {
    v,
    builtAt: Date.now(),
    vendors: Object.fromEntries(vendors.docs.map((d) => [d.id, volatileVendor(d.data())])),
    availability: Object.fromEntries(availability.docs.map((d) => [d.id, availabilityOf(d.id, d.data())])),
    config: (config.data() as GlobalConfig | undefined) ?? null,
  };
}

export const availabilityOf = (id: string, data: Fields) => ({
  vendorId: id,
  unavailable: ((data.unavailable as Record<string, boolean> | undefined) ?? {}) as Record<string, boolean>,
  updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
});

/** Writes both documents from scratch. Used the first time and whenever the status document is missing. */
export async function rebuildAll(): Promise<CatalogData> {
  const data = await buildData();
  await dataRef().set(data);
  await statusRef().set(await buildStatus(data.v));
  return data;
}

/** Rebuilds `data` only if shops or menus really changed, and points `status` at the new version. */
export async function refreshData(): Promise<boolean> {
  const next = await buildData();
  const current = await dataRef().get();
  if (current.exists && current.data()?.v === next.v) return false;
  await dataRef().set(next);
  await patchStatus([[['v'], next.v]]);
  return true;
}

/**
 * Changes single entries of the status document without reading it first, so two shops toggling stock
 * at once cannot overwrite each other. If the document does not exist yet, everything is rebuilt.
 */
export async function patchStatus(parts: Array<[string[], unknown]>): Promise<void> {
  const args: unknown[] = [];
  for (const [path, value] of parts) args.push(new FieldPath(...path), value);
  args.push(new FieldPath('builtAt'), Date.now());
  try {
    await (statusRef().update as (...a: unknown[]) => Promise<unknown>)(...args);
  } catch (err) {
    if ((err as { code?: number }).code !== 5) throw err;
    await rebuildAll();
  }
}

export const REMOVE = () => FieldValue.delete();
