import type { GlobalConfig, Vendor, VendorAvailability, VendorMenu } from '@foodcourt/shared';
import { defaultFirebaseConfig } from './config';
import { liveStore, type LiveStore } from './liveStore';

// Public catalog reads over Firestore's REST API: no SDK in the diner's first download.
// Rules allow public reads of vendors, menus, availability and config.

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

/** Fetches shops, menus, stock and flags in two requests and writes them into the store. */
export async function loadCatalog(store: LiveStore = liveStore): Promise<void> {
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
    .filter((v) => v.status === 'active');
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

/** Keeps the catalog fresh while the page is visible: stock and pauses change during service. */
export function keepCatalogFresh(store: LiveStore = liveStore, everyMs = 60_000): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    if (document.visibilityState === 'visible') {
      try {
        await loadCatalog(store);
        store.setStatus('live');
      } catch {
        store.setStatus(navigator.onLine ? 'error' : 'offline');
      }
    }
    timer = setTimeout(tick, everyMs);
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
