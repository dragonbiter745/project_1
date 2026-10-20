import { collection, doc, documentId, getDocs, limit, onSnapshot, orderBy, query, where, type DocumentData, type Query, type Unsubscribe } from 'firebase/firestore';
import { getIstDateKey, type GlobalConfig, type Order, type SubOrder, type Table, type UserProfile, type Vendor, type VendorAvailability, type VendorMenu } from '@foodcourt/shared';
import { getDb } from './db';
import { liveStore, type LiveStore } from './liveStore';

// Realtime listeners. Each one is scoped (a shop, a day, a diner); none watches a whole collection
// of orders (AGENTS.md).

const withId = <T>(d: { id: string; data: () => DocumentData }) => ({ ...(d.data() as T), id: d.id }) as T;

function onError(store: LiveStore, what: string) {
  return (err: Error) => {
    console.error(`Live ${what} failed`, err);
    store.setStatus(navigator.onLine ? 'error' : 'offline');
  };
}

function watchQuery<T>(store: LiveStore, q: Query, apply: (rows: T[], removed: string[]) => void, what: string): Unsubscribe {
  return onSnapshot(
    q,
    (snap) => {
      store.patch(() => apply(snap.docs.map((d) => withId<T>(d)), snap.docChanges().filter((c) => c.type === 'removed').map((c) => c.doc.id)));
      store.markLoaded(what);
    },
    onError(store, what)
  );
}

function watchConfig(store: LiveStore): Unsubscribe {
  return onSnapshot(
    doc(getDb(), 'config/global'),
    (snap) => {
      if (snap.exists()) store.patch((d) => void (d.config = { ...d.config, ...(snap.data() as GlobalConfig) }));
      store.markLoaded('config');
    },
    onError(store, 'config')
  );
}

function watchShop(store: LiveStore, vendorIds: string[]): Unsubscribe[] {
  if (vendorIds.length === 0) return [];
  const db = getDb();
  const ids = vendorIds.slice(0, 30);
  return [
    watchQuery<VendorMenu>(store, query(collection(db, 'menus'), where(documentId(), 'in', ids)), (rows) => {
      const d = store.getState();
      for (const m of rows) d.menus[(m as VendorMenu & { id: string }).id] = m;
    }, 'menus'),
    watchQuery<VendorAvailability>(store, query(collection(db, 'availability'), where(documentId(), 'in', ids)), (rows) => {
      const d = store.getState();
      for (const a of rows) d.availability[(a as VendorAvailability & { id: string }).id] = { ...a, unavailable: a.unavailable ?? {} };
    }, 'availability'),
  ];
}

/** Re-runs `start` when the IST day rolls over, so day-scoped listeners follow the new date. */
function daily(start: (dateKey: string) => Unsubscribe[]): Unsubscribe {
  let key = getIstDateKey();
  let subs = start(key);
  const timer = setInterval(() => {
    const next = getIstDateKey();
    if (next === key) return;
    key = next;
    subs.forEach((u) => u());
    subs = start(key);
  }, 60_000);
  return () => {
    clearInterval(timer);
    subs.forEach((u) => u());
  };
}

/** A kitchen tablet: its own shop record, menu, stock and today's tickets. */
export function connectVendor(vendorId: string, store: LiveStore = liveStore): Unsubscribe {
  const db = getDb();
  const subs: Unsubscribe[] = [
    watchConfig(store),
    onSnapshot(doc(db, 'vendors', vendorId), (snap) => {
      if (!snap.exists()) return;
      store.patch((d) => void (d.vendors = [withId<Vendor>(snap)]));
      store.markLoaded('vendors');
    }, onError(store, 'vendor')),
    ...watchShop(store, [vendorId]),
    daily((dateKey) => [
      watchQuery<SubOrder>(store, query(collection(db, 'subOrders'), where('vendorId', '==', vendorId), where('dateKey', '==', dateKey), orderBy('ts.placed', 'desc'), limit(800)), (rows) => {
        store.getState().subOrders = Object.fromEntries(rows.map((r) => [r.id, r]));
      }, 'subOrders'),
    ]),
  ];
  return () => subs.forEach((u) => u());
}

/** The court manager: every shop, every table and today's tickets across the court. */
export function connectMaster(store: LiveStore = liveStore): Unsubscribe {
  const db = getDb();
  let shopSubs: Unsubscribe[] = [];
  let shopKey = '';
  const subs: Unsubscribe[] = [
    watchConfig(store),
    watchQuery<Vendor>(store, query(collection(db, 'vendors'), where('status', 'in', ['active', 'inactive', 'suspended'])), (rows) => {
      store.getState().vendors = rows.sort((a, b) => a.name.localeCompare(b.name));
      const key = rows.map((r) => r.id).sort().join();
      if (key !== shopKey) {
        shopKey = key;
        shopSubs.forEach((u) => u());
        shopSubs = watchShop(store, rows.map((r) => r.id));
      }
    }, 'vendors'),
    watchQuery<Table>(store, query(collection(db, 'tables'), where('active', 'in', [true, false]), limit(1000)), (rows) => {
      store.getState().tables = rows.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    }, 'tables'),
    daily((dateKey) => [
      watchQuery<SubOrder>(store, query(collection(db, 'subOrders'), where('dateKey', '==', dateKey), orderBy('ts.placed', 'desc'), limit(3000)), (rows) => {
        store.getState().subOrders = Object.fromEntries(rows.map((r) => [r.id, r]));
      }, 'subOrders'),
    ]),
  ];
  return () => {
    shopSubs.forEach((u) => u());
    subs.forEach((u) => u());
  };
}

/** A diner's live order and its kitchen tickets. */
export function watchOrder(uid: string, orderId: string, store: LiveStore = liveStore): Unsubscribe {
  const db = getDb();
  const subs = [
    onSnapshot(doc(db, 'orders', orderId), (snap) => {
      if (snap.exists()) store.patch((d) => void (d.orders[orderId] = withId<Order>(snap)));
    }, onError(store, 'order')),
    watchQuery<SubOrder>(store, query(collection(db, 'subOrders'), where('uid', '==', uid), where('orderId', '==', orderId)), (rows, removed) => {
      const d = store.getState();
      for (const id of removed) delete d.subOrders[id];
      for (const r of rows) d.subOrders[r.id] = r;
    }, 'tickets'),
  ];
  return () => subs.forEach((u) => u());
}

/** A diner's recent orders and loyalty balance, for the account screens. */
export function watchMyHistory(uid: string, store: LiveStore = liveStore): Unsubscribe {
  const db = getDb();
  const subs = [
    watchQuery<Order>(store, query(collection(db, 'orders'), where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(20)), (rows) => {
      const d = store.getState();
      for (const r of rows) d.orders[r.id] = r;
    }, 'history'),
    watchProfile(uid, store),
  ];
  return () => subs.forEach((u) => u());
}

/** A signed-in diner's own profile: name, preferences, favourites, points. */
export function watchProfile(uid: string, store: LiveStore = liveStore): Unsubscribe {
  return onSnapshot(doc(getDb(), 'users', uid), (snap) => {
    store.patch((d) => {
      if (snap.exists()) d.users[uid] = { ...(snap.data() as UserProfile), uid };
      else delete d.users[uid];
    });
    store.markLoaded('profile');
  }, onError(store, 'profile'));
}

/** One page of a diner's older orders (no listener: past orders rarely change). Returns how many arrived. */
export async function fetchOrdersBefore(uid: string, beforeMs: number, pageSize = 20, store: LiveStore = liveStore): Promise<number> {
  const snap = await getDocs(query(collection(getDb(), 'orders'), where('uid', '==', uid), where('createdAt', '<', beforeMs), orderBy('createdAt', 'desc'), limit(pageSize)));
  store.patch((d) => {
    for (const r of snap.docs) d.orders[r.id] = withId<Order>(r);
  });
  return snap.size;
}

/** Every kitchen ticket of one past order, for its receipt. */
export async function fetchTickets(uid: string, orderId: string, store: LiveStore = liveStore): Promise<void> {
  const snap = await getDocs(query(collection(getDb(), 'subOrders'), where('uid', '==', uid), where('orderId', '==', orderId)));
  store.patch((d) => {
    for (const r of snap.docs) d.subOrders[r.id] = withId<SubOrder>(r);
  });
}
