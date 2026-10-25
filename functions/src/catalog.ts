import * as zlib from 'zlib';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { DATABASE, REGION } from './config';
import { db } from './db';
import {
  REMOVE,
  availabilityOf,
  dataRef,
  patchStatus,
  rebuildAll,
  refreshData,
  staticVendor,
  statusRef,
  versionOf,
  volatileVendor,
} from './lib/catalog';

type Fields = Record<string, unknown>;
type Which = 'data' | 'status';

interface Cached {
  at: number;
  version: string;
  json: string;
  gzip: Buffer;
}

// Each warm instance keeps what it last read for a few seconds, so even requests that get past the CDN
// (every odd query string is a new CDN key) cost the database at most one read per instance per window.
const TTL_MS: Record<Which, number> = { status: 10_000, data: 30_000 };
const memory = new Map<Which, Cached>();
let rebuilding: Promise<unknown> | null = null;

async function load(which: Which): Promise<Cached> {
  const hit = memory.get(which);
  if (hit && Date.now() - hit.at < TTL_MS[which]) return hit;
  let snap = await (which === 'data' ? dataRef() : statusRef()).get();
  if (!snap.exists) {
    // First request ever, or the documents were deleted: build them once, however many arrive together.
    rebuilding ??= rebuildAll().finally(() => (rebuilding = null));
    await rebuilding;
    snap = await (which === 'data' ? dataRef() : statusRef()).get();
  }
  const body = snap.data() ?? {};
  const json = JSON.stringify(body);
  const next: Cached = { at: Date.now(), version: String(body.v ?? ''), json, gzip: zlib.gzipSync(json) };
  memory.set(which, next);
  return next;
}

/** Test hook: forget what this instance has cached. */
export const forgetCatalogMemory = () => memory.clear();

/**
 * The diner's catalogue over plain GET, so Firebase Hosting's CDN can answer almost every request.
 * /api/status is tiny and short-lived; /api/catalog?v=<version> is large but its URL changes whenever
 * its content does, so it can be cached for a day.
 */
export const catalog = onRequest({ region: REGION, cors: false, maxInstances: 3, concurrency: 80, timeoutSeconds: 15, memory: '256MiB' }, async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  const which: Which | null = req.path.endsWith('/status') ? 'status' : req.path.endsWith('/catalog') ? 'data' : null;
  if (!which) {
    res.status(404).send('Not found');
    return;
  }
  try {
    const entry = await load(which);
    const asked = typeof req.query.v === 'string' ? req.query.v : '';
    // A versioned catalogue URL is cached for a day only when it really holds that version.
    const cache =
      which === 'status'
        ? 'public, max-age=15, s-maxage=30'
        : asked && asked === entry.version
          ? 'public, max-age=86400, s-maxage=86400, immutable'
          : 'public, max-age=30, s-maxage=30';
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', cache);
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const gzip = String(req.get('accept-encoding') ?? '').includes('gzip');
    if (gzip) res.setHeader('Content-Encoding', 'gzip');
    if (req.method === 'HEAD') {
      res.status(200).end();
      return;
    }
    res.status(200).send(gzip ? entry.gzip : entry.json);
  } catch (err) {
    logger.error('Catalogue request failed', { which, err: (err as Error).message });
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).send('Try again shortly');
  }
});

// ── Keeping the copies current: one small write per change, never a rebuild per request ──────────────

const watch = <T extends string>(document: T) => ({ document, database: DATABASE, region: REGION, retry: false, maxInstances: 5 }) as const;

export const onMenuChanged = onDocumentWritten(watch('menus/{id}'), async () => {
  await refreshData();
});

export const onShopChanged = onDocumentWritten(watch('vendors/{id}'), async (event) => {
  const id = event.params.id;
  const before = event.data?.before.exists ? (event.data.before.data() as Fields) : null;
  const after = event.data?.after.exists ? (event.data.after.data() as Fields) : null;
  const live = after && after.status === 'active';
  await patchStatus([[['vendors', id], live ? volatileVendor(after) : REMOVE()]]);
  const same = before && after && versionOf(staticVendor(id, before)) === versionOf(staticVendor(id, after));
  if (!same) await refreshData();
});

export const onStockChanged = onDocumentWritten(watch('availability/{id}'), async (event) => {
  const id = event.params.id;
  const fresh = await db.collection('availability').doc(id).get();
  await patchStatus([[['availability', id], fresh.exists ? availabilityOf(id, fresh.data() as Fields) : REMOVE()]]);
});

export const onFlagsChanged = onDocumentWritten({ ...watch('config/{id}') }, async (event) => {
  if (event.params.id !== 'global') return;
  const fresh = await db.collection('config').doc('global').get();
  await patchStatus([[['config'], fresh.exists ? fresh.data() : REMOVE()]]);
});
