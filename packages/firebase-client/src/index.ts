import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  connectFirestoreEmulator,
  collection,
  CollectionReference,
  DocumentData,
} from 'firebase/firestore';
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, Functions, connectFunctionsEmulator } from 'firebase/functions';
import type {
  Venue,
  Vendor,
  VendorMenu,
  VendorAvailability,
  Table,
  Session,
  Order,
  SubOrder,
  UserProfile,
  PointsLedgerEntry,
  GlobalConfig,
} from '@foodcourt/shared';

declare const process: any;

// Safe environment variable accessor for universal runtime (Node, Vite, Next)
const getEnvVar = (key: string, fallback: string = ''): string => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] as string;
  }
  try {
    // Check Vite import.meta.env
    if (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.[key]) {
      return (import.meta as any).env[key] as string;
    }
  } catch {
    // ignore
  }
  return fallback;
};

// Default config for REVA Nest FoodCourt
export const defaultFirebaseConfig = {
  apiKey: getEnvVar('VITE_FIREBASE_API_KEY', 'AIzaSyATt7HT-b9MiY3-JNQZDqfOuSTe6t9AxMg'),
  authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN', 'reva-nest-foodcourt.firebaseapp.com'),
  projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID', 'reva-nest-foodcourt'),
  storageBucket: getEnvVar('VITE_FIREBASE_STORAGE_BUCKET', 'reva-nest-foodcourt.firebasestorage.app'),
  messagingSenderId: getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID', '298874069682'),
  appId: getEnvVar('VITE_FIREBASE_APP_ID', '1:298874069682:web:dae818bd8d6f6c1c9fdfab'),
  measurementId: getEnvVar('VITE_FIREBASE_MEASUREMENT_ID', 'G-2CLZWS3LDE'),
};

let app: FirebaseApp;
let firestore: Firestore;
let auth: Auth;
let functions: Functions;

export function initFirebase(config = defaultFirebaseConfig) {
  if (!getApps().length) {
    app = initializeApp(config);
  } else {
    app = getApp();
  }

  firestore = getFirestore(app, 'default');
  auth = getAuth(app);
  functions = getFunctions(app, 'asia-south1');

  // Check if emulator flag is active
  const isEmulator = getEnvVar('USE_FIREBASE_EMULATOR') === 'true';
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    isEmulator
  ) {
    try {
      connectFirestoreEmulator(firestore, 'localhost', 8080);
      connectAuthEmulator(auth, 'http://localhost:9099');
      connectFunctionsEmulator(functions, 'localhost', 5001);
      console.log('Connected to Firebase Emulators');
    } catch {
      // Ignore already connected warnings in hot reload
    }
  }

  return { app, firestore, auth, functions };
}

// Generic typed converter helper
const createGenericConverter = <T>() => ({
  toFirestore: (data: T): DocumentData => data as DocumentData,
  fromFirestore: (snapshot: any): T => ({ id: snapshot.id, ...snapshot.data() } as T),
});

export const getTypedCollections = (db: Firestore) => ({
  venues: collection(db, 'venues').withConverter(createGenericConverter<Venue>()),
  vendors: collection(db, 'vendors').withConverter(createGenericConverter<Vendor>()),
  menus: collection(db, 'menus').withConverter(createGenericConverter<VendorMenu>()),
  availability: collection(db, 'availability').withConverter(createGenericConverter<VendorAvailability>()),
  tables: collection(db, 'tables').withConverter(createGenericConverter<Table>()),
  sessions: collection(db, 'sessions').withConverter(createGenericConverter<Session>()),
  orders: collection(db, 'orders').withConverter(createGenericConverter<Order>()),
  subOrders: collection(db, 'subOrders').withConverter(createGenericConverter<SubOrder>()),
  users: collection(db, 'users').withConverter(createGenericConverter<UserProfile>()),
  pointsLedger: collection(db, 'pointsLedger').withConverter(createGenericConverter<PointsLedgerEntry>()),
  config: collection(db, 'config').withConverter(createGenericConverter<GlobalConfig>()),
});

export * from './localStore';

// Re-export commonly needed Firebase helpers so consumer apps
// don't need firebase as a direct dependency.
export { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
export { getFunctions, httpsCallable } from 'firebase/functions';
