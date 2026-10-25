import * as crypto from 'crypto';
import { vi } from 'vitest';
import { db } from '../src/db';
import { resetLocalLimits } from '../src/lib/guard';

export const PROJECT = process.env.GCLOUD_PROJECT!;
export const QR = 'Q7xk2PqM9vR4tLw8nB3ydA'; // 22-char base64url token for table T14

export async function resetDb() {
  resetLocalLimits();
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/default/documents`, { method: 'DELETE' });
}

let n = 0;
export const uniqueUid = (p = 'diner') => `${p}_${Date.now().toString(36)}_${n++}`;

/** Invokes a v2 callable the way the Functions runtime would. */
export function call<T = any>(fn: { run: (req: any) => unknown }, data: unknown, uid?: string, claims: Record<string, unknown> = {}): Promise<T> {
  return Promise.resolve(fn.run({ data, auth: uid ? { uid, token: { uid, ...claims } } : undefined, rawRequest: { headers: {}, ip: '10.0.0.1' }, acceptsStreaming: false })) as Promise<T>;
}

export async function seed(opts: { paymentsEnabled: boolean }) {
  const now = Date.now();
  const batch = db.batch();
  batch.set(db.doc('config/global'), {
    pointsPerRupee: 0.1,
    pointsExpiryDays: 90,
    gstPct: 5,
    taxInclusive: true,
    platformFeePaise: 0,
    flags: { paymentsEnabled: opts.paymentsEnabled, loyaltyEnabled: true, maintenance: false },
  });
  for (const [id, code, name, items] of [
    ['v-rm', 'RM', 'Roll Me', [['rm-1', 'Paneer Roll', 12000], ['rm-2', 'Egg Roll', 9000]]],
    ['v-sv', 'SV', 'Siddi Vinayaka', [['sv-1', 'Masala Dosa', 7000]]],
  ] as const) {
    batch.set(db.doc(`vendors/${id}`), { name, code, status: 'active', acceptingOrders: true, defaultPrepMin: 10, fulfilmentMode: 'pickup', acceptSlaSec: 180 });
    batch.set(db.doc(`menus/${id}`), { vendorId: id, version: 1, updatedAt: now, categories: [{ id: 'c', name: 'Main', items: items.map(([iid, iname, price]) => ({ id: iid, name: iname, pricePaise: price, veg: true })) }] });
    batch.set(db.doc(`availability/${id}`), { vendorId: id, unavailable: {}, updatedAt: now });
  }
  batch.set(db.doc('tables/tbl-14'), { code: 'T14', label: 'T-14', zone: 'Main', active: true, qrToken: QR });
  await batch.commit();
}

/** Opens a session for a fresh diner and returns its id. */
export async function sessionFor(startSession: any, uid: string): Promise<string> {
  const res = await call<{ sessionId: string }>(startSession, { qrToken: QR }, uid);
  return res.sessionId;
}

export function sign(body: string, ts: string, secret = 'test-secret-key') {
  return crypto.createHmac('sha256', secret).update(ts + body).digest('base64');
}

/** Minimal Express-like req/res pair for onRequest handlers. */
export function webhookCall(handler: (req: any, res: any) => unknown, body: unknown, headers: Record<string, string>) {
  const raw = JSON.stringify(body);
  const req = { method: 'POST', rawBody: Buffer.from(raw), body, ip: '1.2.3.4', get: (h: string) => headers[h.toLowerCase()], headers };
  let status = 200;
  let payload: unknown;
  const res = {
    on() {
      return res;
    },
    setHeader() {
      return res;
    },
    status(code: number) {
      status = code;
      return res;
    },
    send(p: unknown) {
      payload = p;
      return res;
    },
    json(p: unknown) {
      payload = p;
      return res;
    },
  };
  return Promise.resolve(handler(req, res)).then(() => ({ status, payload }));
}

/** Replaces global fetch with a fake Cashfree API; returns the recorded calls. */
export function fakeCashfree(handlers: Partial<Record<'createOrder' | 'getOrder' | 'refund' | 'getRefund', (url: string, body: any) => { status?: number; json: any }>>) {
  const calls: Array<{ url: string; method: string; body: any }> = [];
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('http://')) return (globalThis as any).__realFetch(input, init);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: init?.method ?? 'GET', body });
    const kind = /\/refunds\//.test(url) ? 'getRefund' : /\/refunds$/.test(url) ? 'refund' : init?.method === 'POST' ? 'createOrder' : 'getOrder';
    const h = handlers[kind];
    const out = h ? h(url, body) : { status: 500, json: { message: 'unexpected call' } };
    return new Response(JSON.stringify(out.json), { status: out.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  });
  return calls;
}
(globalThis as any).__realFetch ??= globalThis.fetch;

/** Calls an onRequest handler with a GET (or other) request and returns what it sent back. */
export function httpCall(handler: (req: any, res: any) => unknown, opts: { method?: string; path: string; query?: Record<string, string>; headers?: Record<string, string> }) {
  const headers = Object.fromEntries(Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const req = { method: opts.method ?? 'GET', path: opts.path, query: opts.query ?? {}, headers, ip: '1.2.3.4', get: (h: string) => headers[h.toLowerCase()] };
  const sent: Record<string, string> = {};
  let status = 200;
  let payload: unknown;
  const res = {
    on() {
      return res;
    },
    setHeader(k: string, v: string) {
      sent[k.toLowerCase()] = String(v);
      return res;
    },
    status(code: number) {
      status = code;
      return res;
    },
    send(p: unknown) {
      payload = p;
      return res;
    },
    end() {
      return res;
    },
  };
  return Promise.resolve(handler(req, res)).then(() => ({ status, headers: sent, payload }));
}
