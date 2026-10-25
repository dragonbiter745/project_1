import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { AccountActionSchema, MAX_FAVOURITES, favouriteKey, type UserProfile } from '@foodcourt/shared';
import { REGION } from '../config';
import { app, db } from '../db';
import { customerRef, mergeCustomer } from '../lib/customers';
import { limitLocal, requireUid } from '../lib/guard';

/** The master console's customer list shows who a member is; guests stay anonymous there. */
async function mirrorToCustomer(uid: string, p: Partial<UserProfile>, now: number): Promise<void> {
  const ref = customerRef(uid);
  if (!(await ref.get()).exists) return;
  await ref.set(
    { member: true, name: p.name ?? null, email: p.email ?? null, photoURL: p.photoURL ?? null, ...(p.phone ? { phone: p.phone } : {}), updatedAt: now },
    { merge: true }
  );
}

const FORMER_DINER = 'Former diner';

/** Guests are anonymous Firebase users; an account is any other provider (Google today). */
export function signInProvider(req: Pick<CallableRequest, 'auth'>): string | null {
  const firebase = (req.auth?.token as { firebase?: { sign_in_provider?: unknown } } | undefined)?.firebase;
  return typeof firebase?.sign_in_provider === 'string' ? firebase.sign_in_provider : null;
}

function requireMember(req: CallableRequest): string {
  const uid = requireUid(req);
  const provider = signInProvider(req);
  if (!provider || provider === 'anonymous') throw new HttpsError('failed-precondition', 'Sign in first.');
  return uid;
}

async function updateInChunks(refs: DocumentReference[], data: Record<string, unknown>): Promise<void> {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + 400)) batch.update(ref, data);
    await batch.commit();
  }
}

/**
 * Moves a guest's sessions, orders, tickets and points into a signed-in account (PRD §7.4), for a
 * returning diner who signs in on a new phone. Safe to run twice: the second run finds nothing to move.
 */
export async function mergeGuest(from: string, to: string): Promise<{ orders: number }> {
  if (!from || from === to) return { orders: 0 };
  const [sessions, orders, tickets, ledger] = await Promise.all([
    db.collection('sessions').where('uid', '==', from).limit(200).get(),
    db.collection('orders').where('uid', '==', from).limit(500).get(),
    db.collection('subOrders').where('uid', '==', from).limit(1000).get(),
    db.collection('pointsLedger').where('uid', '==', from).limit(1000).get(),
  ]);
  await updateInChunks(sessions.docs.map((d) => d.ref), { uid: to, linkedUserId: to });
  await updateInChunks(orders.docs.map((d) => d.ref), { uid: to, mergedFrom: from });
  await updateInChunks([...tickets.docs, ...ledger.docs].map((d) => d.ref), { uid: to });

  // Points, spend and visit counts move once: the guest records are marked merged (or removed) in the same transaction.
  const fromRef = db.collection('users').doc(from);
  const toRef = db.collection('users').doc(to);
  await db.runTransaction(async (tx) => {
    const [snap, guestCustomer, memberCustomer] = await Promise.all([tx.get(fromRef), tx.get(customerRef(from)), tx.get(customerRef(to))]);
    const now = Date.now();
    mergeCustomer(tx, guestCustomer, memberCustomer, now);
    const guest = snap.data() as Partial<UserProfile> | undefined;
    if (!guest || guest.mergedInto) return;
    tx.set(toRef, { pointsBalance: FieldValue.increment(guest.pointsBalance ?? 0), lifetimeSpendPaise: FieldValue.increment(guest.lifetimeSpendPaise ?? 0) }, { merge: true });
    tx.set(fromRef, { mergedInto: to, pointsBalance: 0, lifetimeSpendPaise: 0, updatedAt: now }, { merge: true });
  });
  return { orders: orders.size };
}

/** The diner's chosen name goes on the tokens of their next order at this table. */
async function renameSession(uid: string, sessionId: string | undefined, name: string | undefined): Promise<void> {
  if (!sessionId || !name) return;
  const ref = db.collection('sessions').doc(sessionId);
  const snap = await ref.get();
  if (snap.exists && snap.data()!.uid === uid && (snap.data()!.expiresAt as number) > Date.now()) await ref.update({ displayName: name });
}

/** What the account screens need straight after a change; the live users/{uid} listener follows. */
const publicProfile = (uid: string, p: Partial<UserProfile>) => ({
  uid,
  name: p.name ?? null,
  email: p.email ?? null,
  photoURL: p.photoURL ?? null,
  phone: p.phone ?? null,
  studentId: p.studentId ?? null,
  prefs: p.prefs ?? {},
  favourites: p.favourites ?? [],
  createdAt: p.createdAt ?? null,
});

export const accountAction = onCall({ region: REGION, maxInstances: 50, concurrency: 80, timeoutSeconds: 60 }, async (req) => {
  const uid = requireMember(req);
  limitLocal(`account:${uid}`, 60, 300);
  const parsed = AccountActionSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid request.');
  const input = parsed.data;
  const ref = db.collection('users').doc(uid);
  const now = Date.now();
  const token = req.auth!.token as { email?: string; name?: string; picture?: string };

  if (input.action === 'SYNC') {
    let merged = 0;
    if (input.guestToken) {
      try {
        const guest = await getAuth(app).verifyIdToken(input.guestToken);
        if (guest.firebase?.sign_in_provider === 'anonymous' && guest.uid !== uid) merged = (await mergeGuest(guest.uid, uid)).orders;
      } catch (err) {
        // An expired or forged guest token only means nothing is merged; sign-in itself still works.
        logger.warn('Guest merge skipped', { uid, err: (err as Error).message });
      }
    }
    const { profile, firstSignIn } = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = (snap.data() ?? {}) as Partial<UserProfile>;
      const next: Partial<UserProfile> = {
        member: true,
        email: token.email ?? existing.email ?? null,
        photoURL: token.picture ?? existing.photoURL ?? null,
        lastLoginAt: now,
        updatedAt: now,
        ...(existing.name ? {} : token.name?.trim() ? { name: token.name.trim().slice(0, 40) } : {}),
        ...(existing.createdAt ? {} : { createdAt: now }),
        ...(existing.prefs ? {} : { prefs: { orderUpdates: true } }),
        ...(existing.pointsBalance === undefined ? { pointsBalance: 0 } : {}),
        ...(existing.lifetimeSpendPaise === undefined ? { lifetimeSpendPaise: 0 } : {}),
      };
      tx.set(ref, next, { merge: true });
      return { profile: { ...existing, ...next }, firstSignIn: !existing.member };
    });
    await Promise.all([renameSession(uid, input.sessionId, profile.name), mirrorToCustomer(uid, profile, now)]);
    return { profile: publicProfile(uid, profile), merged, firstSignIn };
  }

  if (input.action === 'UPDATE_PROFILE') {
    const changes: Record<string, unknown> = { updatedAt: now };
    if (input.name !== undefined) changes.name = input.name;
    if (input.phone !== undefined) changes.phone = input.phone || FieldValue.delete();
    if (input.studentId !== undefined) changes.studentId = input.studentId.toUpperCase() || FieldValue.delete();
    await ref.set(changes, { merge: true });
    const saved = ((await ref.get()).data() ?? {}) as Partial<UserProfile>;
    await Promise.all([renameSession(uid, input.sessionId, input.name), mirrorToCustomer(uid, saved, now)]);
    return { profile: publicProfile(uid, saved) };
  }

  if (input.action === 'SET_PREFS') {
    const prefs = Object.fromEntries(Object.entries({ vegOnly: input.vegOnly, offers: input.offers, orderUpdates: input.orderUpdates }).filter(([, v]) => v !== undefined));
    await ref.set({ prefs, updatedAt: now }, { merge: true });
    return { prefs };
  }

  if (input.action === 'FAVOURITE') {
    const key = favouriteKey(input.vendorId, input.itemId);
    const favourites = await db.runTransaction(async (tx) => {
      const list = (((await tx.get(ref)).data() as Partial<UserProfile> | undefined)?.favourites ?? []).filter((k) => k !== key);
      if (input.on) {
        if (list.length >= MAX_FAVOURITES) throw new HttpsError('resource-exhausted', `You can save up to ${MAX_FAVOURITES} dishes. Remove one first.`);
        list.unshift(key);
      }
      tx.set(ref, { favourites: list, updatedAt: now }, { merge: true });
      return list;
    });
    return { favourites };
  }

  // DELETE_ACCOUNT: orders and tickets stay for the court's accounts, without the diner's name or number.
  const [orders, tickets] = await Promise.all([
    db.collection('orders').where('uid', '==', uid).limit(1000).get(),
    db.collection('subOrders').where('uid', '==', uid).limit(2000).get(),
  ]);
  await updateInChunks(orders.docs.map((d) => d.ref), { customerPhone: FieldValue.delete(), displayName: FORMER_DINER, accountDeletedAt: now });
  await updateInChunks(tickets.docs.map((d) => d.ref), { customerDisplay: FORMER_DINER });
  await Promise.all([ref.delete(), customerRef(uid).delete()]);
  await db.collection('auditLogs').add({ at: now, by: uid, area: 'account', action: 'DELETE_ACCOUNT', orders: orders.size });
  try {
    await getAuth(app).deleteUser(uid);
  } catch (err) {
    logger.error('Auth user delete failed', { uid, err: (err as Error).message });
  }
  return { deleted: true };
});
