import * as crypto from 'crypto';
import { getAuth, type Auth, type UserRecord } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  INVITE_TTL_HOURS,
  InviteCompleteSchema,
  InviteLookupSchema,
  VENDOR_LOGIN_ROLES,
  VendorAccessActionSchema,
  type InviteInfo,
  type VendorAccessList,
  type VendorLoginRole,
  type VendorLoginRow,
} from '@foodcourt/shared';
import { BRAND_URL, REGION, RESEND_API_KEY, SHOP_ADMIN_URL, VENDOR_URL, APP_CHECK_ENFORCE } from '../config';
import { app, db } from '../db';
import { clientIp, limitLocal, limitShared, requireUid, roleOf } from '../lib/guard';
import { inviteEmail } from '../lib/inviteEmail';
import { sendMail } from '../lib/mailer';

type AuthApi = Pick<Auth, 'getUserByEmail' | 'getUser' | 'createUser' | 'updateUser' | 'setCustomUserClaims' | 'deleteUser' | 'listUsers' | 'revokeRefreshTokens'>;
let authClient: () => AuthApi = () => getAuth(app);
/** Test hook: swap the Admin Auth client for an in-memory one. */
export const setAccessAuthClient = (fn: () => AuthApi): void => {
  authClient = fn;
};

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const isRole = (r: unknown): r is VendorLoginRole => VENDOR_LOGIN_ROLES.includes(r as VendorLoginRole);
/** Seeded stand-in logins (kitchen-rm@foodcourt.local) are not real inboxes. */
const isPlaceholder = (email: string) => /\.(local|test|invalid|example)$/i.test(email.split('@')[1] ?? '');

interface Claims {
  role?: string;
  vendorId?: string;
}
const claimsOf = (u: UserRecord): Claims => (u.customClaims ?? {}) as Claims;

const accessRef = (uid: string) => db.doc(`vendorAccess/${uid}`);
const inviteRef = (hash: string) => db.doc(`invites/${hash}`);

/** Which app the link opens: kitchen logins use the kitchen display, finance logins use shop admin. */
const appFor = (role: VendorLoginRole): InviteInfo['app'] => (role === 'vendorFinance' ? 'shop-admin' : 'kitchen');
const baseUrl = (role: VendorLoginRole) => (appFor(role) === 'shop-admin' ? SHOP_ADMIN_URL.value() : VENDOR_URL.value()).replace(/\/+$/, '');

const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

async function allUsers(auth: AuthApi): Promise<UserRecord[]> {
  const users: UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken && users.length < 5000);
  return users;
}

export const vendorAccess = onCall({ region: REGION, maxInstances: 5, timeoutSeconds: 60, secrets: [RESEND_API_KEY] }, async (req) => {
  const by = requireUid(req);
  if (roleOf(req).role !== 'master') throw new HttpsError('permission-denied', 'Only the court manager can do this.');
  await limitShared(`vendor-access:${by}`, 120, 300);
  const parsed = VendorAccessActionSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid request.');
  const input = parsed.data;
  const auth = authClient();
  const audit = (details: Record<string, unknown>) => db.collection('auditLogs').add({ at: Date.now(), by, area: 'vendor-access', ...details });

  /** Writes a fresh single-use link (replacing any older one) and emails it. */
  const sendLink = async (user: UserRecord, vendorId: string, role: VendorLoginRole, kind: 'invite' | 'reset') => {
    const email = user.email!;
    await limitShared(`invite-email:${email}`, 5, 3600);
    const shop = await db.doc(`vendors/${vendorId}`).get();
    if (!shop.exists) throw new HttpsError('not-found', 'No such shop.');
    const token = crypto.randomBytes(32).toString('base64url');
    const hash = sha256(token);
    const now = Date.now();
    const access = await accessRef(user.uid).get();
    const old = access.data()?.inviteHash as string | undefined;
    const batch = db.batch();
    if (old) batch.delete(inviteRef(old));
    batch.set(inviteRef(hash), { uid: user.uid, email, vendorId, role, kind, createdAt: now, expiresAt: now + INVITE_TTL_HOURS * 3600_000, by });
    batch.set(accessRef(user.uid), { uid: user.uid, email, vendorId, role, inviteHash: hash, ...(access.exists ? {} : { invitedAt: now, invitedBy: by }) }, { merge: true });
    await batch.commit();
    const link = `${baseUrl(role)}/set-password?t=${token}`;
    await sendMail(inviteEmail({ to: email, shopName: String(shop.data()?.name ?? 'your shop'), role, link, kind, logoUrl: `${BRAND_URL.value().replace(/\/+$/, '')}/qrave-wordmark.png` }));
    await accessRef(user.uid).set({ lastSentAt: Date.now(), sendCount: FieldValue.increment(1) }, { merge: true });
    await audit({ action: kind === 'reset' ? 'SEND_RESET' : 'SEND_INVITE', vendorId, email, role });
  };

  const vendorUser = async (uid: string): Promise<{ user: UserRecord; claims: Claims & { role: VendorLoginRole; vendorId: string } }> => {
    const user = await auth.getUser(uid).catch(() => null);
    const claims = user ? claimsOf(user) : {};
    if (!user || !isRole(claims.role) || !claims.vendorId) throw new HttpsError('not-found', 'No such shop login.');
    return { user, claims: claims as Claims & { role: VendorLoginRole; vendorId: string } };
  };

  switch (input.action) {
    case 'LIST': {
      const staff = (await allUsers(auth)).filter((u) => u.email && isRole(claimsOf(u).role) && claimsOf(u).vendorId);
      const access = new Map<string, FirebaseFirestore.DocumentData>();
      if (staff.length) for (const d of await db.getAll(...staff.map((u) => accessRef(u.uid)))) if (d.exists) access.set(d.id, d.data()!);
      const logins: VendorLoginRow[] = staff.map((u) => {
        const a = access.get(u.uid);
        const claims = claimsOf(u);
        const signedIn = u.metadata.lastSignInTime ? Date.parse(u.metadata.lastSignInTime) : undefined;
        // No access record means a login created before invites existed: it already has a password. A sign-in time
        // alone proves nothing: Firebase reports one for a brand-new account too.
        const activated = !a || Boolean(a.activatedAt);
        return {
          uid: u.uid,
          email: u.email!,
          vendorId: claims.vendorId!,
          role: claims.role as VendorLoginRole,
          status: u.disabled ? 'disabled' : activated ? 'active' : 'invited',
          placeholder: isPlaceholder(u.email!),
          ...(typeof a?.lastSentAt === 'number' ? { lastSentAt: a.lastSentAt } : {}),
          ...(typeof a?.activatedAt === 'number' ? { activatedAt: a.activatedAt } : {}),
          ...(signedIn && activated ? { lastSignInAt: signedIn } : {}),
        };
      });
      return { logins } satisfies VendorAccessList;
    }

    case 'INVITE': {
      if (!(await db.doc(`vendors/${input.vendorId}`).get()).exists) throw new HttpsError('not-found', 'Pick a shop from the list.');
      let user = await auth.getUserByEmail(input.email).catch(() => null);
      if (user) {
        const c = claimsOf(user);
        if (c.role === 'master') throw new HttpsError('failed-precondition', 'That email belongs to the court manager.');
        if (!isRole(c.role) || !c.vendorId) throw new HttpsError('failed-precondition', 'That email already has a Qrave account. Use a different email for the shop login.');
        if (c.vendorId !== input.vendorId) throw new HttpsError('failed-precondition', 'That email already belongs to another shop.');
        if (user.disabled) throw new HttpsError('failed-precondition', 'That login is switched off. Switch it on first.');
        if (c.role !== input.role) await auth.setCustomUserClaims(user.uid, { role: input.role, vendorId: input.vendorId });
      } else {
        // The account starts with a random password nobody ever sees; the person sets their own through the link.
        user = await auth.createUser({ email: input.email, password: crypto.randomBytes(24).toString('base64url'), emailVerified: false });
        await auth.setCustomUserClaims(user.uid, { role: input.role, vendorId: input.vendorId });
      }
      const a = (await accessRef(user.uid).get()).data();
      await sendLink(user, input.vendorId, input.role, a?.activatedAt ? 'reset' : 'invite');
      return { uid: user.uid };
    }

    case 'RESEND': {
      const { user, claims } = await vendorUser(input.uid);
      if (isPlaceholder(user.email!)) throw new HttpsError('failed-precondition', 'That is a stand-in address, not a real inbox. Invite the shop’s real email instead.');
      if (user.disabled) throw new HttpsError('failed-precondition', 'That login is switched off. Switch it on first.');
      const a = (await accessRef(user.uid).get()).data();
      const activated = !a || Boolean(a.activatedAt);
      await sendLink(user, claims.vendorId, claims.role, activated ? 'reset' : 'invite');
      return { ok: true };
    }

    case 'SET_ENABLED': {
      const { user, claims } = await vendorUser(input.uid);
      await auth.updateUser(user.uid, { disabled: !input.enabled });
      if (!input.enabled) await auth.revokeRefreshTokens(user.uid);
      await audit({ action: input.enabled ? 'ENABLE_LOGIN' : 'DISABLE_LOGIN', vendorId: claims.vendorId, email: user.email });
      return { ok: true };
    }

    case 'REMOVE_LOGIN': {
      const { user, claims } = await vendorUser(input.uid);
      const a = (await accessRef(user.uid).get()).data();
      await auth.deleteUser(user.uid);
      const batch = db.batch();
      batch.delete(accessRef(user.uid));
      if (a?.inviteHash) batch.delete(inviteRef(a.inviteHash as string));
      await batch.commit();
      await audit({ action: 'REMOVE_LOGIN', vendorId: claims.vendorId, email: user.email });
      return { ok: true };
    }

    case 'CREATE_SHOP': {
      if (input.open === input.close) throw new HttpsError('invalid-argument', 'Opening and closing time cannot be the same.');
      const id = `vendor-${slug(input.name)}`;
      if (id === 'vendor-') throw new HttpsError('invalid-argument', 'Use letters or numbers in the shop name.');
      const ref = db.doc(`vendors/${id}`);
      const existing = await ref.get();
      if (existing.exists) {
        if (existing.data()?.createdByKey === input.requestKey) return { vendorId: id }; // a double tap lands once
        throw new HttpsError('already-exists', 'A shop with that name already exists.');
      }
      const clash = await db.collection('vendors').where('code', '==', input.code).limit(1).get();
      if (!clash.empty) throw new HttpsError('already-exists', `The token code ${input.code} is already used by ${String(clash.docs[0]!.data().name)}.`);
      const now = Date.now();
      // Starts paused with an empty menu: the owner adds dishes, then resumes orders.
      await ref.create({
        name: input.name,
        code: input.code,
        status: 'active',
        acceptingOrders: false,
        defaultPrepMin: input.defaultPrepMin,
        fulfilmentMode: 'pickup',
        acceptSlaSec: 180,
        feePct: input.feePct,
        perOrderFeePaise: 100,
        hours: { open: input.open, close: input.close },
        createdByKey: input.requestKey,
        createdAt: now,
        updatedAt: now,
      });
      await Promise.all([
        db.doc(`menus/${id}`).set({ vendorId: id, version: 1, categories: [], updatedAt: now }),
        db.doc(`availability/${id}`).set({ vendorId: id, unavailable: {}, updatedAt: now }),
      ]);
      await audit({ action: 'CREATE_SHOP', vendorId: id, name: input.name, code: input.code });
      return { vendorId: id };
    }

    case 'DELETE_SHOP': {
      const ref = db.doc(`vendors/${input.vendorId}`);
      const shop = await ref.get();
      if (!shop.exists) throw new HttpsError('not-found', 'No such shop.');
      if (String(shop.data()?.name ?? '').trim().toLowerCase() !== input.confirmName.trim().toLowerCase()) {
        throw new HttpsError('invalid-argument', 'Type the shop name exactly to confirm.');
      }
      // Every login for the shop goes either way: nobody keeps access to a removed shop.
      const mine = (await allUsers(auth)).filter((u) => claimsOf(u).vendorId === input.vendorId && isRole(claimsOf(u).role));
      for (const u of mine) await auth.deleteUser(u.uid);
      const cleanup = db.batch();
      for (const u of mine) cleanup.delete(accessRef(u.uid));
      await cleanup.commit();

      const history = await db.collection('subOrders').where('vendorId', '==', input.vendorId).limit(1).get();
      if (history.empty) {
        await Promise.all([ref.delete(), db.doc(`menus/${input.vendorId}`).delete(), db.doc(`availability/${input.vendorId}`).delete()]);
        await audit({ action: 'DELETE_SHOP', vendorId: input.vendorId, name: shop.data()?.name, logins: mine.length });
        return { removed: true, archived: false, logins: mine.length };
      }
      // Past orders, payouts and reports still point at this shop, so it is switched off and hidden rather than erased.
      await ref.update({ status: 'suspended', acceptingOrders: false, updatedAt: Date.now() });
      await audit({ action: 'ARCHIVE_SHOP', vendorId: input.vendorId, name: shop.data()?.name, logins: mine.length });
      return { removed: false, archived: true, logins: mine.length };
    }
  }
});

// ─── The emailed link (no sign-in: the token is the proof) ───────────────────────────────────────

const gone = () => new HttpsError('not-found', 'This link has expired or was already used. Ask the court manager for a new one.');

async function loadInvite(token: string) {
  const snap = await inviteRef(sha256(token)).get();
  const d = snap.data();
  if (!d || d.usedAt || typeof d.expiresAt !== 'number' || d.expiresAt < Date.now() || !isRole(d.role)) throw gone();
  return { ref: snap.ref, ...(d as { uid: string; email: string; vendorId: string; role: VendorLoginRole }) };
}

export const inspectInvite = onCall({ region: REGION, enforceAppCheck: APP_CHECK_ENFORCE, maxInstances: 5 }, async (req) => {
  limitLocal(`invite-ip:${clientIp(req)}`, 60, 600);
  const parsed = InviteLookupSchema.safeParse(req.data);
  if (!parsed.success) throw gone();
  const invite = await loadInvite(parsed.data.token);
  const shop = await db.doc(`vendors/${invite.vendorId}`).get();
  return { email: invite.email, role: invite.role, shopName: String(shop.data()?.name ?? 'your shop'), app: appFor(invite.role) } satisfies InviteInfo;
});

export const completeInvite = onCall({ region: REGION, enforceAppCheck: APP_CHECK_ENFORCE, maxInstances: 5 }, async (req) => {
  limitLocal(`invite-ip:${clientIp(req)}`, 30, 600);
  const parsed = InviteCompleteSchema.safeParse(req.data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw issue?.path[0] === 'password' ? new HttpsError('invalid-argument', issue.message) : gone();
  }
  const { token, password } = parsed.data;
  const invite = await loadInvite(token);
  if (password.toLowerCase() === invite.email.toLowerCase()) throw new HttpsError('invalid-argument', 'The password cannot be your email.');
  const auth = authClient();
  const user = await auth.getUser(invite.uid).catch(() => null);
  const c = user ? claimsOf(user) : {};
  if (!user || user.disabled || c.vendorId !== invite.vendorId || !isRole(c.role)) throw gone();

  // Claim the link first so two taps can't both use it; hand it back if the password change fails.
  const claimed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(invite.ref);
    if (!fresh.exists || fresh.data()?.usedAt) return false;
    tx.update(invite.ref, { usedAt: Date.now() });
    return true;
  });
  if (!claimed) throw gone();
  try {
    await auth.updateUser(user.uid, { password, emailVerified: true });
    await auth.revokeRefreshTokens(user.uid); // any session from before the password was set ends here
  } catch (err) {
    await invite.ref.update({ usedAt: FieldValue.delete() });
    throw err;
  }
  await accessRef(user.uid).set({ activatedAt: Date.now() }, { merge: true });
  await db.collection('auditLogs').add({ at: Date.now(), by: user.uid, area: 'vendor-access', action: 'PASSWORD_SET', vendorId: invite.vendorId, email: invite.email });
  return { email: invite.email, app: appFor(invite.role) };
});
