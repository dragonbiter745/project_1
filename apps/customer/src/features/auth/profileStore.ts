import { create } from 'zustand';

/** The details checkout needs: the name on tokens and the mobile number for online payments. */
export interface CustomerProfile {
  name: string;
  /** A Google account may not have given a number yet; checkout asks for it before paying online. */
  phone?: string;
  studentId?: string;
}

// Same key and shape as the previous app, so details saved before accounts existed carry over.
const KEY = 'fc_customer_profile';

const read = (): CustomerProfile | null => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CustomerProfile) : null;
  } catch {
    return null;
  }
};

interface ProfileState {
  profile: CustomerProfile | null;
  signIn: (profile: CustomerProfile) => void;
  signOut: () => void;
}

export const useProfile = create<ProfileState>()((set) => ({
  profile: read(),
  signIn: (profile) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(profile));
    } catch {
      // storage unavailable (private mode); keep in memory
    }
    set({ profile });
  },
  signOut: () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
    set({ profile: null });
  },
}));
