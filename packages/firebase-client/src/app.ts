import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { defaultFirebaseConfig, getEnvVar } from './config';

export { defaultFirebaseConfig, getEnvVar };

export function getFirebaseApp(config = defaultFirebaseConfig): FirebaseApp {
  const effectiveConfig = shouldUseEmulators() ? { ...config, projectId: 'demo-foodcourt' } : config;
  if (getApps().length) return getApp();
  const app = initializeApp(effectiveConfig);
  // App Check: proves to the backend that calls come from our own apps, not a script. It is inert until a reCAPTCHA
  // v3 site key is baked in (VITE_APPCHECK_SITE_KEY), and never runs against the local emulators.
  const siteKey = getEnvVar('VITE_APPCHECK_SITE_KEY');
  if (siteKey && !shouldUseEmulators() && typeof window !== 'undefined') {
    try {
      initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true });
    } catch {
      // Already initialised (hot reload) or blocked by the browser: the backend decides whether that is acceptable.
    }
  }
  return app;
}

export function shouldUseEmulators(): boolean {
  return (
    (getEnvVar('USE_FIREBASE_EMULATOR') === 'true' || getEnvVar('VITE_USE_FIREBASE_EMULATOR') === 'true') &&
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  );
}
