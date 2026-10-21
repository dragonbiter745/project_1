import * as crypto from 'crypto';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { ShopAdminActionSchema, type MenuCategory, type MenuItem, type ShopAdminInput, type VendorMenu } from '@foodcourt/shared';
import { REGION } from '../config';
import { app, db } from '../db';
import { limitShared, requireUid, roleOf } from '../lib/guard';

// Tests swap this for a fake: the Auth emulator is not part of the test run.
let authClient: () => Pick<Auth, 'getUserByEmail' | 'updateUser'> = () => getAuth(app);
export const setAuthClient = (fn: typeof authClient) => {
  authClient = fn;
};

/** A menu is one document; this keeps it far below Firestore's 1 MB limit. */
const MAX_ITEMS = 300;
const MAX_CATEGORIES = 30;

const hash = (s: string, n = 16) => crypto.createHash('sha256').update(s).digest('hex').slice(0, n);

/** Photos and logos must be this shop's own uploads in Firebase Storage, never a link to somewhere else. */
function ownUpload(url: string | null | undefined, vendorId: string): boolean {
  if (!url) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.hostname !== 'firebasestorage.googleapis.com') return false;
    const name = decodeURIComponent(u.pathname.split('/o/')[1] ?? '');
    return name.startsWith(`menus/${vendorId}/`) && !name.includes('..');
  } catch {
    return false;
  }
}

const fail = (code: 'invalid-argument' | 'not-found' | 'failed-precondition', message: string): never => {
  throw new HttpsError(code, message);
};

function applyMenu(menu: VendorMenu, input: ShopAdminInput, vendorId: string): { menu: VendorMenu; summary: string; clearedStock?: string } {
  const categories: MenuCategory[] = (menu.categories ?? []).map((c) => ({ ...c, items: c.items.map((i) => ({ ...i })) }));
  const count = () => categories.reduce((n, c) => n + c.items.length, 0);
  const find = (id: string) => categories.find((c) => c.id === id);
  const next = (summary: string, clearedStock?: string) => ({ menu: { ...menu, categories }, summary, clearedStock });

  switch (input.action) {
    case 'SAVE_ITEM': {
      if (!ownUpload(input.imageUrl, vendorId)) fail('invalid-argument', 'Upload the photo from this page again.');
      const target = find(input.categoryId) ?? fail('not-found', 'That section no longer exists. Reload the menu.');
      const itemId = input.itemId ?? `i${hash(`${vendorId}:${input.requestKey}`)}`;
      const existing = categories.flatMap((c) => c.items).find((i) => i.id === itemId);
      if (input.itemId && !existing) fail('not-found', 'That dish was removed. Reload the menu.');
      if (!existing && count() >= MAX_ITEMS) fail('failed-precondition', `A menu can hold ${MAX_ITEMS} dishes.`);
      const sameSection = target.items.some((i) => i.id === itemId);
      const item: MenuItem = {
        id: itemId,
        name: input.name,
        pricePaise: input.pricePaise,
        veg: input.veg,
        // A dish keeps its place when only edited; one moved to another section goes to its end.
        sort: existing && sameSection ? existing.sort : target.items.reduce((m, i) => Math.max(m, i.sort), 0) + 1,
        ...(input.desc ? { desc: input.desc } : {}),
        ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
        ...(input.prepMin ? { prepMin: input.prepMin } : {}),
        ...(existing?.tags?.length ? { tags: existing.tags } : {}),
      };
      for (const c of categories) c.items = c.items.filter((i) => i.id !== itemId);
      target.items.push(item);
      target.items.sort((a, b) => a.sort - b.sort);
      return next(existing ? `Edited ${item.name}` : `Added ${item.name}`);
    }
    case 'DELETE_ITEM': {
      const owner = categories.find((c) => c.items.some((i) => i.id === input.itemId));
      if (!owner) return next('Dish was already removed');
      const name = owner.items.find((i) => i.id === input.itemId)!.name;
      owner.items = owner.items.filter((i) => i.id !== input.itemId);
      return next(`Removed ${name}`, input.itemId);
    }
    case 'SAVE_CATEGORY': {
      const existing = input.categoryId ? find(input.categoryId) : undefined;
      if (input.categoryId && !existing) fail('not-found', 'That section no longer exists. Reload the menu.');
      if (existing) {
        existing.name = input.name;
        return next(`Renamed section to ${input.name}`);
      }
      const id = `c${hash(`${vendorId}:${input.requestKey}`)}`;
      if (categories.some((c) => c.id === id)) return next(`Added section ${input.name}`);
      if (categories.length >= MAX_CATEGORIES) fail('failed-precondition', `A menu can hold ${MAX_CATEGORIES} sections.`);
      categories.push({ id, name: input.name, sort: categories.reduce((m, c) => Math.max(m, c.sort), 0) + 1, items: [] });
      return next(`Added section ${input.name}`);
    }
    case 'DELETE_CATEGORY': {
      const c = find(input.categoryId);
      if (!c) return next('Section was already removed');
      if (c.items.length) fail('failed-precondition', 'Move or remove the dishes in this section first.');
      categories.splice(categories.indexOf(c), 1);
      return next(`Removed section ${c.name}`);
    }
    case 'REORDER': {
      const list: Array<{ id: string; sort: number }> | undefined = input.categoryId ? find(input.categoryId)?.items : categories;
      if (!list) return fail('not-found', 'That section no longer exists. Reload the menu.');
      const rank = new Map(input.ids.map((id, i) => [id, i]));
      // Anything the page did not know about (added on another phone) keeps its place at the end.
      list.sort((a, b) => (rank.get(a.id) ?? 1e6 + a.sort) - (rank.get(b.id) ?? 1e6 + b.sort));
      list.forEach((x, i) => (x.sort = i + 1));
      return next(input.categoryId ? 'Reordered dishes' : 'Reordered sections');
    }
    default:
      return fail('invalid-argument', 'Not a menu action.');
  }
}

/**
 * The shop owner's controls: menu (dishes, prices, photos, sections), shop settings and the
 * kitchen login's password. One shop only, taken from the sign-in's claims; the court manager may
 * pass a vendorId. The server re-validates everything, so the page can never set odd prices.
 * Every action is safe to repeat: ids come from requestKey and writes are whole-state.
 */
export const shopAdmin = onCall({ region: REGION, maxInstances: 10, timeoutSeconds: 30 }, async (req) => {
  const uid = requireUid(req);
  const { role, vendorId: own } = roleOf(req);
  const asked = typeof (req.data as { vendorId?: unknown })?.vendorId === 'string' ? (req.data as { vendorId: string }).vendorId : null;
  const vendorId = role === 'vendorFinance' ? own : role === 'master' ? asked : null;
  if (!vendorId) throw new HttpsError('permission-denied', "Only the shop's admin login can do this.");
  await limitShared(`shop-admin:${uid}`, 120, 300);
  const parsed = ShopAdminActionSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid request.');
  const input = parsed.data;
  const by = typeof req.auth?.token.email === 'string' ? req.auth.token.email : uid;
  const audit = (details: Record<string, unknown>) => db.collection('auditLogs').add({ at: Date.now(), by, area: 'shop-admin', vendorId, ...details });

  const vendorRef = db.doc(`vendors/${vendorId}`);
  if (!(await vendorRef.get()).exists) throw new HttpsError('not-found', 'No such shop.');

  if (input.action === 'UPDATE_SETTINGS') {
    if (input.open === input.close) throw new HttpsError('invalid-argument', 'Opening and closing time cannot be the same.');
    if (!ownUpload(input.logoUrl, vendorId)) throw new HttpsError('invalid-argument', 'Upload the logo from this page again.');
    await vendorRef.update({
      hours: { open: input.open, close: input.close },
      defaultPrepMin: input.defaultPrepMin,
      fulfilmentMode: input.fulfilmentMode,
      logoUrl: input.logoUrl ? input.logoUrl : FieldValue.delete(),
      updatedAt: Date.now(),
    });
    await audit({ action: 'UPDATE_SETTINGS', summary: `Hours ${input.open}-${input.close}, prep ${input.defaultPrepMin} min, ${input.fulfilmentMode}` });
    return { ok: true };
  }

  if (input.action === 'SET_KITCHEN_PASSWORD') {
    await limitShared(`kitchen-password:${vendorId}`, 10, 3600);
    const auth = authClient();
    const user = await auth.getUserByEmail(input.kitchenEmail).catch(() => null);
    const claims = (user?.customClaims ?? {}) as { role?: string; vendorId?: string };
    // The same message for "no such account" and "someone else's account": no way to probe emails.
    if (!user || claims.vendorId !== vendorId || (claims.role !== 'vendorAdmin' && claims.role !== 'vendorStaff')) {
      throw new HttpsError('not-found', 'No kitchen login for this shop uses that email.');
    }
    await auth.updateUser(user.uid, { password: input.password });
    await audit({ action: 'SET_KITCHEN_PASSWORD', summary: `Changed the password of ${input.kitchenEmail}` });
    return { ok: true };
  }

  const menuRef = db.doc(`menus/${vendorId}`);
  const availRef = db.doc(`availability/${vendorId}`);
  const result = await db.runTransaction(async (tx) => {
    const [menuSnap, availSnap] = await Promise.all([tx.get(menuRef), tx.get(availRef)]);
    const menu = (menuSnap.exists ? menuSnap.data() : { vendorId, version: 0, categories: [], updatedAt: 0 }) as VendorMenu;
    const out = applyMenu(menu, input, vendorId);
    tx.set(menuRef, { ...out.menu, vendorId, version: (menu.version ?? 0) + 1, updatedAt: Date.now() });
    if (out.clearedStock && availSnap.exists) tx.update(availRef, { [`unavailable.${out.clearedStock}`]: FieldValue.delete(), updatedAt: Date.now() });
    return out;
  });
  await audit({ action: input.action, summary: result.summary });
  return { ok: true, menu: result.menu };
});
