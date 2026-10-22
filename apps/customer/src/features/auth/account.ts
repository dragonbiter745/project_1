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
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-login-credentials')
    return "That email and password don't match. Check them or reset your password.";
  if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use') return 'This email already has an account. Log in instead.';
  if (code === 'auth/weak-password') return 'Choose a stronger password, at least 8 characters.';
  if (code === 'auth/invalid-email') return 'That email address looks wrong.';
  if (code === 'auth/unauthorized-domain' || code === 'auth/operation-not-allowed') return 'This sign-in method is not switched on for this site yet. Try another one.';
  if (code === 'auth/too-many-requests') return 'Too many tries. Wait a minute and try again.';
  return "Couldn't sign you in. Please try again.";
}

export interface SignInResult {
  firstSignIn: boolean;
  merged: number;
  profile: AccountProfile;
}

type AuthModule = typeof import('@foodcourt/firebase-client/auth');

/** After any sign-in: refresh the token, sync the account and move this phone's guest orders across. */
async function finishSignIn(auth: ReturnType<AuthModule['getAuthClient']>, sessionId?: string, guestToken?: string): Promise<SignInResult> {
  const user = auth.currentUser!;
  // The sign-in provider claim the server checks is only in a fresh token.
  await user.getIdToken(true);
  useAuth.setState({ user: { uid: user.uid, member: true, email: user.email, photoURL: user.photoURL, name: user.displayName } });
  const result = await accountCall<SignInResult>({
    action: 'SYNC',
    ...(sessionId ? { sessionId } : {}),
    ...(guestToken ? { guestToken } : {}),
  });
  rememberDetails(result.profile);
  renameTableSession(result.profile.name);
  return result;
}

/**
 * Upgrades the anonymous guest to a Google account, keeping the same uid so the cart, this table
 * and today's orders stay put. If that Google account already exists (a returning diner on a new
 * phone), it signs into it and the server moves this phone's guest orders across.
 */
export async function signInWithGoogle(sessionId?: string): Promise<SignInResult> {
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
  return finishSignIn(auth, sessionId, guestToken);
}

export interface SignUpDetails {
  name: string;
  email: string;
  phone: string;
  password: string;
}

/**
 * A new account from the diner's own details. The guest is upgraded in place (same uid), so the
 * cart and anything ordered at this table stay with the new account.
 */
export async function signUpWithEmail(details: SignUpDetails, sessionId?: string): Promise<SignInResult> {
  await ensureAnonymousUser();
  const { getAuthClient, EmailAuthProvider, linkWithCredential, updateProfile } = await import('@foodcourt/firebase-client/auth');
  const auth = getAuthClient();
  const current = auth.currentUser;
  if (!current) throw Object.assign(new Error('No guest user'), { code: 'auth/network-request-failed' });
  const name = details.name.trim();
  // A signed-in diner never reaches the sign-up form, so this is always the guest being upgraded.
  await linkWithCredential(current, EmailAuthProvider.credential(details.email.trim(), details.password));
  await updateProfile(auth.currentUser!, { displayName: name });
  await finishSignIn(auth, sessionId);
  const { profile } = await accountCall<{ profile: AccountProfile }>({ action: 'UPDATE_PROFILE', name, phone: details.phone, ...(sessionId ? { sessionId } : {}) });
  rememberDetails(profile);
  renameTableSession(profile.name);
  return { firstSignIn: true, merged: 0, profile };
}

/** Logs into an existing email account; this phone's guest orders move across to it. */
export async function logInWithEmail(email: string, password: string, sessionId?: string): Promise<SignInResult> {
  await ensureAnonymousUser();
  const { getAuthClient, signInWithEmailAndPassword } = await import('@foodcourt/firebase-client/auth');
  const auth = getAuthClient();
  const current = auth.currentUser;
  const guestToken = current?.isAnonymous ? await current.getIdToken() : undefined;
  await signInWithEmailAndPassword(auth, email.trim(), password);
  return finishSignIn(auth, sessionId, guestToken);
}

/** Firebase emails a reset link; the reply never says whether the address has an account. */
export async function sendPasswordReset(email: string): Promise<void> {
  const { getAuthClient, sendPasswordResetEmail } = await import('@foodcourt/firebase-client/auth');
  try {
    await sendPasswordResetEmail(getAuthClient(), email.trim());
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (code !== 'auth/user-not-found') throw err;
  }
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
