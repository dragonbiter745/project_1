import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { defaultFirebaseConfig, getEnvVar } from './config';

export { defaultFirebaseConfig, getEnvVar };

export function getFirebaseApp(config = defaultFirebaseConfig): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(config);
}

export function shouldUseEmulators(): boolean {
  return (
    getEnvVar('USE_FIREBASE_EMULATOR') === 'true' &&
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  );
}
