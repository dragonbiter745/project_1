import { useEffect, useState } from 'react';
import { notify } from '../../lib/toast';
import { getCallable } from '../../lib/firebase';

// Web push on this phone. The browser asks permission once; the token goes to the server (pushAction)
// so it can tell this diner when food is ready, and (if they agreed) about offers.

const VAPID_KEY = (import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined) ?? '';
const TOKEN_KEY = 'fc_push_token';

/**
 * on / off: works here; blocked: the diner said no in browser settings; install: iPhone, which only
 * allows it after Add to Home Screen; unsupported: this browser can't; unavailable: not set up yet.
 */
export type PushState = 'on' | 'off' | 'blocked' | 'install' | 'unsupported' | 'unavailable';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

function storedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function currentPushState(): PushState {
  if (!VAPID_KEY) return 'unavailable';
  const capable = 'serviceWorker' in navigator && 'Notification' in window && 'PushManager' in window;
  if (!capable) return isIos() && !isStandalone() ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' && storedToken() ? 'on' : 'off';
}

type PushRequest = { action: 'REGISTER' | 'UNREGISTER'; token: string };

async function register(token: string): Promise<void> {
  const fn = await getCallable<PushRequest, { ok: boolean }>('pushAction');
  await fn({ action: 'REGISTER', token });
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // storage blocked: the server still has it
  }
}

async function tokenForThisPhone(): Promise<string> {
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { getPushToken } = await import('@foodcourt/firebase-client/messaging');
  return getPushToken(VAPID_KEY, registration);
}

/** Asks the browser, then registers this phone. Must run from a tap (browsers require it). */
export async function enablePush(): Promise<PushState> {
  const state = currentPushState();
  if (state !== 'off' && state !== 'on') return state;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  await register(await tokenForThisPhone());
  window.dispatchEvent(new Event('fc-push-change'));
  return 'on';
}

export async function disablePush(): Promise<void> {
  const token = storedToken();
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event('fc-push-change'));
  if (!token) return;
  const fn = await getCallable<PushRequest, { ok: boolean }>('pushAction');
  await fn({ action: 'UNREGISTER', token }).catch(() => undefined);
  const { deletePushToken } = await import('@foodcourt/firebase-client/messaging');
  await deletePushToken().catch(() => undefined);
}

/**
 * Keeps this phone's token current (tokens rotate, and a sign-in moves it to the account) and shows
 * pushes that arrive while the app is open as an in-app message.
 */
export function startPush(uid: string | null): () => void {
  if (!('serviceWorker' in navigator)) return () => undefined;
  const onMessage = (e: MessageEvent<{ type?: string; title?: string; body?: string }>) => {
    if (e.data?.type === 'fc-push' && e.data.title) notify(e.data.title, { description: e.data.body });
  };
  navigator.serviceWorker.addEventListener('message', onMessage);
  if (uid && currentPushState() === 'on') {
    void tokenForThisPhone()
      .then(register)
      .catch(() => undefined);
  }
  return () => navigator.serviceWorker.removeEventListener('message', onMessage);
}

export function usePushState(): PushState {
  const [state, setState] = useState<PushState>(() => (typeof window === 'undefined' ? 'unavailable' : currentPushState()));
  useEffect(() => {
    const update = () => setState(currentPushState());
    window.addEventListener('fc-push-change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('fc-push-change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return state;
}
