import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { defaultFirebaseConfig, getEnvVar } from './config';

export { defaultFirebaseConfig, getEnvVar };

export function getFirebaseApp(config = defaultFirebaseConfig): FirebaseApp {
  const effectiveConfig = shouldUseEmulators() ? { ...config, projectId: 'demo-foodcourt' } : config;
  return getApps().length ? getApp() : initializeApp(effectiveConfig);
}

export function shouldUseEmulators(): boolean {
  return (
    (getEnvVar('USE_FIREBASE_EMULATOR') === 'true' || getEnvVar('VITE_USE_FIREBASE_EMULATOR') === 'true') &&
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  );
}
