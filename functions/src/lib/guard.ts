import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { REQUIRE_MFA } from '../config';
import { db } from '../db';

export type Role = 'master' | 'vendorFinance' | 'vendorAdmin' | 'vendorStaff';

export function requireUid(req: CallableRequest): string {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please reload the page and try again.');
  return uid;
}

/**
 * When REQUIRE_MFA is on, a court-manager call must come from a session signed in with a second factor.
 * Firebase puts the factor in the ID token (firebase.sign_in_second_factor) after a TOTP sign-in.
 */
export function requireSecondFactor(req: CallableRequest): void {
  if (!REQUIRE_MFA.value()) return;
  const firebase = (req.auth?.token as { firebase?: { sign_in_second_factor?: unknown } } | undefined)?.firebase;
  if (!firebase?.sign_in_second_factor) throw new HttpsError('permission-denied', 'Sign in again with your authenticator code to do this.');
}

export function roleOf(req: CallableRequest): { role: Role | null; vendorId: string | null } {
  const t = (req.auth?.token ?? {}) as Record<string, unknown>;
  const role = t.role === 'master' || t.role === 'vendorFinance' || t.role === 'vendorAdmin' || t.role === 'vendorStaff' ? (t.role as Role) : null;
  return { role, vendorId: typeof t.vendorId === 'string' ? t.vendorId : null };
}

/**
 * The caller's address for rate limits: the right-most X-Forwarded-For entry, which Google's front end
 * appends with the address it actually saw. Anything to its left was sent by the caller and can be made up,
 * so keying on the first entry would let a script dodge every per-IP limit by inventing a new one each time.
 */
export function clientIp(req: { rawRequest?: { headers?: Record<string, unknown>; ip?: string } }): string {
  const fwd = req.rawRequest?.headers?.['x-forwarded-for'];
  const hops = typeof fwd === 'string' ? fwd.split(',').map((h) => h.trim()).filter(Boolean) : [];
  return hops[hops.length - 1] || req.rawRequest?.ip || 'unknown';
}

// ─── Rate limiting ─────────────────────────────────────────────────────────

const local = new Map<string, { n: number; resetAt: number }>();

/** Test hook: forget every in-memory count. */
export const resetLocalLimits = (): void => local.clear();

function tooMany(): HttpsError {
  return new HttpsError('resource-exhausted', 'Too many requests. Please wait a moment and try again.');
}

/**
 * Per-instance limiter. Cheap and stops floods before they touch Firestore. Used for IP keys:
 * a whole campus can share one public IP, so these limits must stay generous.
 */
export function limitLocal(key: string, limit: number, windowSec: number): void {
  const now = Date.now();
  const entry = local.get(key);
  if (!entry || now >= entry.resetAt) {
    local.set(key, { n: 1, resetAt: now + windowSec * 1000 });
    if (local.size > 20_000) for (const [k, v] of local) if (now >= v.resetAt) local.delete(k);
    return;
  }
  if (entry.n >= limit) throw tooMany();
  entry.n++;
}

/**
 * Fixed-window limiter shared across all instances, stored in rateLimits/{key}.
 * A TTL policy on `expireAt` deletes old windows.
 */
export async function limitShared(key: string, limit: number, windowSec: number): Promise<void> {
  limitLocal(`s:${key}`, limit, windowSec);
  const ref = db.collection('rateLimits').doc(encodeURIComponent(key).slice(0, 1400));
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() as { n: number; resetAt: number } | undefined;
    if (!d || now >= d.resetAt) {
      tx.set(ref, { n: 1, resetAt: now + windowSec * 1000, expireAt: Timestamp.fromMillis(now + windowSec * 1000 + 3_600_000) });
      return;
    }
    if (d.n >= limit) throw tooMany();
    tx.update(ref, { n: FieldValue.increment(1) });
  });
}
