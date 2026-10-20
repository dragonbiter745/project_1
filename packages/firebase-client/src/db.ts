import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { getFirebaseApp, shouldUseEmulators } from './app';

let db: Firestore | null = null;

/** The project's Firestore lives in the named database "default". */
export function getDb(): Firestore {
  if (db) return db;
  db = getFirestore(getFirebaseApp(), 'default');
  if (shouldUseEmulators()) {
    try {
      connectFirestoreEmulator(db, 'localhost', 8080);
    } catch {
      // already connected during HMR
    }
  }
  return db;
}
