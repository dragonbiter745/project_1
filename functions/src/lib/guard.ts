import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../db';

export type Role = 'master' | 'vendorFinance' | 'vendorAdmin' | 'vendorStaff';

export function requireUid(req: CallableRequest): string {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please reload the page and try again.');
  return uid;
}

export function roleOf(req: CallableRequest): { role: Role | null; vendorId: string | null } {
  const t = (req.auth?.token ?? {}) as Record<string, unknown>;
  const role = t.role === 'master' || t.role === 'vendorFinance' || t.role === 'vendorAdmin' || t.role === 'vendorStaff' ? (t.role as Role) : null;
  return { role, vendorId: typeof t.vendorId === 'string' ? t.vendorId : null };
}

/** First hop of X-Forwarded-For (set by Google's front end), falling back to the socket address. */
export function clientIp(req: { rawRequest?: { headers?: Record<string, unknown>; ip?: string } }): string {
  const fwd = req.rawRequest?.headers?.['x-forwarded-for'];
  const first = typeof fwd === 'string' ? fwd.split(',')[0]?.trim() : undefined;
  return first || req.rawRequest?.ip || 'unknown';
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
