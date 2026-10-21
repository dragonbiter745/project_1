import type { AccountActionInput, UserPrefs } from '@foodcourt/shared';
import { useAuth } from '../../lib/authStore';
import { ensureAnonymousUser, getCallable } from '../../lib/firebase';
import { liveStore } from '../../lib/store';
import { renameTableSession } from '../session/useTableSession';
import { useProfile } from './profileStore';

export interface AccountProfile {
  uid: string;
  name: string | null;
  email: string | null;
  photoURL: string | null;
  phone: string | null;
  studentId: string | null;
  prefs: UserPrefs;
  favourites: string[];
  createdAt: number | null;
}

export async function accountCall<T>(input: AccountActionInput): Promise<T> {
  const fn = await getCallable<AccountActionInput, T>('accountAction');
  return (await fn(input)).data;
}

/** Keeps the details used at checkout (name on tokens, mobile for receipts) in step with the account. */
export function rememberDetails(p: Pick<AccountProfile, 'name' | 'phone' | 'studentId'>): void {
  const local = useProfile.getState().profile;
  useProfile.getState().signIn({
    name: p.name || local?.name || 'REVA diner',
    phone: p.phone || local?.phone || undefined,
    studentId: p.studentId || local?.studentId || undefined,
  });
}

export class SignInCancelled extends Error {}

const CANCELLED = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

export function signInErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'auth/popup-blocked') return 'Your browser blocked the Google window. Allow pop-ups for this site and try again.';
  if (code === 'auth/network-request-failed') return "You're offline. Reconnect and try again.";
  if (code === 'auth/unauthorized-domain' || code === 'auth/operation-not-allowed') return 'Google sign-in is not switched on for this site yet. You can keep ordering as a guest.';
  if (code === 'auth/too-many-requests') return 'Too many tries. Wait a minute and try again.';
  return "Couldn't sign you in. You can keep ordering as a guest.";
}

/**
 * Upgrades the anonymous guest to a Google account, keeping the same uid so the cart, this table
 * and today's orders stay put. If that Google account already exists (a returning diner on a new
 * phone), it signs into it and the server moves this phone's guest orders across.
 */
export async function signInWithGoogle(sessionId?: string): Promise<{ firstSignIn: boolean; merged: number; profile: AccountProfile }> {
  await ensureAnonymousUser();
  const { getAuthClient, GoogleAuthProvider, linkWithPopup, signInWithCredential } = await import('@foodcourt/firebase-client/auth');
  const auth = getAuthClient();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const current = auth.currentUser;
  let guestToken: string | undefined;

  if (!current || current.isAnonymous) {
    try {
      if (!current) throw Object.assign(new Error('No guest user'), { code: 'auth/no-current-user' });
      await linkWithPopup(current, provider);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (CANCELLED.has(code)) throw new SignInCancelled();
      if (code !== 'auth/credential-already-in-use' && code !== 'auth/email-already-in-use') throw err;
      const credential = GoogleAuthProvider.credentialFromError(err as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]);
      if (!credential) throw err;
      guestToken = current ? await current.getIdToken() : undefined;
      await signInWithCredential(auth, credential);
    }
  }

  const user = auth.currentUser!;
  // The sign-in provider claim the server checks is only in a fresh token.
  await user.getIdToken(true);
  useAuth.setState({ user: { uid: user.uid, member: true, email: user.email, photoURL: user.photoURL, name: user.displayName } });
  const result = await accountCall<{ firstSignIn: boolean; merged: number; profile: AccountProfile }>({
    action: 'SYNC',
    ...(sessionId ? { sessionId } : {}),
    ...(guestToken ? { guestToken } : {}),
  });
  rememberDetails(result.profile);
  renameTableSession(result.profile.name);
  return result;
}

const LOCAL_KEYS = ['fc_customer_profile', 'fc_order_history_v1', 'fc_cart_v1'];

/** Signs out and starts over as a fresh guest: the page reloads into a new anonymous session. */
export async function signOutToGuest(): Promise<void> {
  const { getAuthClient, signOut } = await import('@foodcourt/firebase-client/auth');
  await signOut(getAuthClient());
  try {
    for (const key of LOCAL_KEYS) localStorage.removeItem(key);
    for (const key of Object.keys(sessionStorage)) if (key.startsWith('fc_session_')) sessionStorage.removeItem(key);
  } catch {
    // storage blocked: the reload still starts a new guest
  }
  liveStore.patch((d) => {
    d.users = {};
    d.orders = {};
    d.subOrders = {};
  });
  window.location.reload();
}

/** Favourites change on screen at once and roll back if the server refuses. */
export async function toggleFavourite(vendorId: string, itemId: string, on: boolean): Promise<void> {
  const uid = useAuth.getState().user?.uid;
  if (!uid) return;
  const key = `${vendorId}:${itemId}`;
  const before = liveStore.getState().users[uid]?.favourites ?? [];
  const apply = (list: string[]) =>
    liveStore.patch((d) => {
      const user = d.users[uid];
      if (user) d.users[uid] = { ...user, favourites: list };
    });
  apply(on ? [key, ...before.filter((k) => k !== key)] : before.filter((k) => k !== key));
  try {
    const { favourites } = await accountCall<{ favourites: string[] }>({ action: 'FAVOURITE', vendorId, itemId, on });
    apply(favourites);
  } catch (err) {
    apply(before);
    throw err;
  }
}
