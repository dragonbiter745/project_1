import { create } from 'zustand';

/** `account` is the full-screen account hub; the rest are bottom sheets. */
export type SheetName = 'cart' | 'tracking' | 'login' | 'details' | 'account' | 'coupons';

interface UiState {
  open: Record<SheetName, boolean>;
  /** Why the sign-in sheet opened ("Sign in to save favourites"); null shows the general pitch. */
  loginReason: string | null;
  /** The account page to open straight to (a notification tap opens the inbox). */
  hubStart: 'inbox' | null;
  show: (sheet: SheetName) => void;
  hide: (sheet: SheetName) => void;
  showLogin: (reason?: string) => void;
  showHub: (start?: 'inbox') => void;
}

export const useUi = create<UiState>()((set) => ({
  open: { cart: false, tracking: false, login: false, details: false, account: false, coupons: false },
  loginReason: null,
  hubStart: null,
  show: (sheet) => set((s) => ({ open: { ...s.open, [sheet]: true } })),
  hide: (sheet) => set((s) => ({ open: { ...s.open, [sheet]: false } })),
  showLogin: (reason) => set((s) => ({ loginReason: reason ?? null, open: { ...s.open, login: true } })),
  showHub: (start) => set((s) => ({ hubStart: start ?? null, open: { ...s.open, account: true } })),
}));
