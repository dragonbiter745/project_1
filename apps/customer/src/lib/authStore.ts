import { create } from 'zustand';

/** Who is using this phone: an anonymous guest, or a diner signed in with Google or email. */
export interface AuthUser {
  uid: string;
  member: boolean;
  email: string | null;
  photoURL: string | null;
  name: string | null;
}

export const useAuth = create<{ user: AuthUser | null }>()(() => ({ user: null }));

export const selectMember = (s: { user: AuthUser | null }) => Boolean(s.user?.member);
