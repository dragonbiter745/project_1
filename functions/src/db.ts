import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const app = getApps().length ? getApps()[0] : initializeApp();
// LOADTEST_DATABASE is only ever set by `pnpm load:real` (a throwaway database); production never sets it.
export const db = getFirestore(app, process.env.LOADTEST_DATABASE || process.env.FIRESTORE_DATABASE || 'default');
db.settings({ ignoreUndefinedProperties: true });
