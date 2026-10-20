import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
import { getFirebaseApp } from './app';

// Web push tokens for the customer app. Loaded only when a diner turns notifications on.

export const pushSupported = () => isSupported().catch(() => false);

/** This browser's push token, tied to the app's own service worker. */
export async function getPushToken(vapidKey: string, registration: ServiceWorkerRegistration): Promise<string> {
  return getToken(getMessaging(getFirebaseApp()), { vapidKey, serviceWorkerRegistration: registration });
}

export async function deletePushToken(): Promise<void> {
  await deleteToken(getMessaging(getFirebaseApp()));
}
