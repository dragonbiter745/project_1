import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getFirebaseApp, shouldUseEmulators } from './app';

let db: Firestore | null = null;
let persistent = false;

/**
 * Staff apps call this once at start. The browser then keeps its own copy of what it has read, so a reload
 * or a returning listener fetches only what changed instead of every document again.
 */
export function enablePersistentCache(): void {
  persistent = true;
}

/** The project's Firestore lives in the named database "default". Every module shares this one instance. */
export function getDb(): Firestore {
  if (db) return db;
  const app = getFirebaseApp();
  if (persistent && !shouldUseEmulators()) {
    try {
      db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }, 'default');
    } catch {
      // No IndexedDB here (private mode, old browser) or already started: use the normal in-memory cache.
      db = null;
    }
  }
  db ??= getFirestore(app, 'default');
  if (shouldUseEmulators()) {
    try {
      connectFirestoreEmulator(db, 'localhost', 8080);
    } catch {
      // already connected during HMR
    }
  }
  return db;
}
