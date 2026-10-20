import { onIdTokenChanged, signInWithEmailAndPassword, signOut as fbSignOut, type User } from 'firebase/auth';
import { getAuthClient } from './auth';

export type StaffRole = 'master' | 'finance' | 'vendorAdmin' | 'vendorStaff';

export interface StaffUser {
  uid: string;
  email: string | null;
  role: StaffRole | null;
  vendorId: string | null;
}

/** Reports the signed-in staff member with their role claims (null while signed out). */
export function watchStaff(cb: (user: StaffUser | null) => void): () => void {
  return onIdTokenChanged(getAuthClient(), async (user: User | null) => {
    if (!user || user.isAnonymous) return cb(null);
    const token = await user.getIdTokenResult();
    const role = token.claims.role;
    cb({
      uid: user.uid,
      email: user.email,
      role: role === 'master' || role === 'finance' || role === 'vendorAdmin' || role === 'vendorStaff' ? role : null,
      vendorId: typeof token.claims.vendorId === 'string' ? token.claims.vendorId : null,
    });
  });
}

const FRIENDLY: Record<string, string> = {
  'auth/invalid-credential': 'That email and password do not match.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'No connection. Check the network and try again.',
  'auth/user-disabled': 'This account has been switched off. Ask the court manager.',
};

export async function staffSignIn(email: string, password: string): Promise<void> {
  try {
    await signInWithEmailAndPassword(getAuthClient(), email.trim(), password);
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    throw new Error(FRIENDLY[code] ?? 'Sign-in failed. Try again.');
  }
}

export const staffSignOut = () => fbSignOut(getAuthClient());
