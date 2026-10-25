import type { CatalogData, CatalogStatus, GlobalConfig, Vendor, VendorAvailability, VendorMenu } from '@foodcourt/shared';
import { defaultFirebaseConfig } from './config';
import { liveStore, type LiveStore } from './liveStore';

// The diner's catalogue arrives over plain HTTP (no database SDK in the first download). In production it comes
// from the CDN-cached /api endpoints; the Firestore REST path below is for local development only.

const DOCS = `https://firestore.googleapis.com/v1/projects/${defaultFirebaseConfig.projectId}/databases/default/documents`;
const KEY = `key=${defaultFirebaseConfig.apiKey}`;

type FsValue = Record<string, unknown>;

function decode(v: FsValue): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(String(v.timestampValue));
  if ('mapValue' in v) return decodeFields(((v.mapValue as { fields?: Record<string, FsValue> }).fields) ?? {});
  if ('arrayValue' in v) return (((v.arrayValue as { values?: FsValue[] }).values) ?? []).map(decode);
  return null;
}

function decodeFields(fields: Record<string, FsValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));
}

interface RestDoc {
  name: string;
  fields?: Record<string, FsValue>;
}

const idOf = (doc: RestDoc) => doc.name.slice(doc.name.lastIndexOf('/') + 1);

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: 'no-store' });
  if (!res.ok) throw new Error(`Catalog request failed (${res.status})`);
  return (await res.json()) as T;
}

/** Straight from Firestore: local development only. Production never reads the database for the catalogue. */
async function loadCatalogDirect(store: LiveStore): Promise<void> {
  // A structured query, not the list-documents endpoint: Firestore refuses unfiltered lists of a
  // named database's collection for public callers, while the same read as a query is allowed.
  const rows = await getJson<Array<{ document?: RestDoc }>>(`${DOCS}:runQuery?${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'vendors' }], limit: 100 } }),
  });
  const vendors = rows
    .flatMap((r) => (r.document ? [r.document] : []))
    .map((d) => ({ id: idOf(d), ...decodeFields(d.fields ?? {}) }) as Vendor)
    .filter((v) => v.status === 'active')
    // Same order as the staff apps; Firestore returns shops in no particular order.
    .sort((a, b) => a.name.localeCompare(b.name));
  const names = [
    ...vendors.flatMap((v) => [`menus/${v.id}`, `availability/${v.id}`]),
    'config/global',
  ].map((p) => `projects/${defaultFirebaseConfig.projectId}/databases/default/documents/${p}`);
  const batch = await getJson<Array<{ found?: RestDoc; missing?: string }>>(`${DOCS}:batchGet?${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents: names }),
  });
  store.patch((draft) => {
    draft.vendors = vendors;
    for (const entry of batch) {
      if (!entry.found) continue;
      const path = entry.found.name.split('/documents/')[1] ?? '';
      const data = decodeFields(entry.found.fields ?? {});
      const [col, id] = path.split('/');
      if (col === 'menus' && id) draft.menus[id] = data as unknown as VendorMenu;
      if (col === 'availability' && id) draft.availability[id] = { vendorId: id, unavailable: {}, updatedAt: 0, ...data } as VendorAvailability;
      if (col === 'config') draft.config = { ...draft.config, ...(data as unknown as GlobalConfig), flags: { ...draft.config.flags, ...((data as unknown as GlobalConfig).flags ?? {}) } };
    }
  });
  store.markLoaded('catalog');
}

// ── The diner's catalogue through the CDN ─────────────────────────────────────────────────────────────
// A phone never reads the database for the catalogue. /api/status is tiny and short-lived, and
// /api/catalog?v=<version> is large but cached for a day, so thousands of open pages cost the backend a
// handful of reads a minute in total. The heavy part is also kept in this browser between visits.

const CATALOG_KEY = 'fc_catalog_v2';
let heldData: CatalogData | null = null;

function savedData(): CatalogData | null {
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    return raw ? (JSON.parse(raw) as CatalogData) : null;
  } catch {
    return null;
  }
}

function saveData(data: CatalogData): void {
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(data));
  } catch {
    // storage full or blocked: it is simply fetched again next time
  }
}

// Default cache mode on purpose: the CDN's max-age is what keeps these requests off the backend.
async function fromCdn<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Catalog request failed (${res.status})`);
  return (await res.json()) as T;
}

const isLocalDev = () => typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

/** Shops, menus, stock and flags for the diner, from the CDN: the small status, then the catalogue only if its version moved. */
export async function loadCatalog(store: LiveStore = liveStore): Promise<void> {
  if (isLocalDev()) return loadCatalogDirect(store);
  const status = await fromCdn<CatalogStatus>('/api/status');
  let data = heldData ?? savedData();
  if (!data || data.v !== status.v) {
    data = await fromCdn<CatalogData>(`/api/catalog?v=${encodeURIComponent(status.v)}`);
    saveData(data);
  }
  heldData = data;
  const fresh = data;
  store.patch((draft) => {
    draft.vendors = fresh.vendors.map((v) => ({ ...v, ...(status.vendors[v.id] ?? {}) }) as Vendor);
    for (const v of fresh.vendors) {
      const menu = fresh.menus[v.id];
      if (menu) draft.menus[v.id] = menu;
      const stock = status.availability[v.id];
      draft.availability[v.id] = { updatedAt: 0, ...(stock ?? {}), vendorId: v.id, unavailable: stock?.unavailable ?? {} } as VendorAvailability;
    }
    if (status.config) draft.config = { ...draft.config, ...status.config, flags: { ...draft.config.flags, ...(status.config.flags ?? {}) } };
  });
  store.markLoaded('catalog');
}

/**
 * Keeps the catalog fresh while the page is visible: stock and pauses change during service. Checks are
 * spread out (about every 90 s, never in step across phones) and back off while the network is failing.
 */
export function keepCatalogFresh(store: LiveStore = liveStore, everyMs = 90_000): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let failures = 0;
  const tick = async () => {
    if (stopped) return;
    if (document.visibilityState === 'visible') {
      try {
        await loadCatalog(store);
        store.setStatus('live');
        failures = 0;
      } catch {
        failures += 1;
        store.setStatus(navigator.onLine ? 'error' : 'offline');
      }
    }
    timer = setTimeout(tick, everyMs * (0.85 + Math.random() * 0.3) * 2 ** Math.min(failures, 2));
  };
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    if (timer) clearTimeout(timer);
    void tick();
  };
  document.addEventListener('visibilitychange', onVisible);
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
