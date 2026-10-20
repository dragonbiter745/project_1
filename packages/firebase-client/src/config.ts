// Public web config (safe to ship) and env lookup, without importing the Firebase SDK.

declare const process: any;

// Safe environment variable accessor for universal runtime (Node, Vite, Next)
export const getEnvVar = (key: string, fallback: string = ''): string => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] as string;
  }
  try {
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

