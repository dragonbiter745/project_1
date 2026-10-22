import { create } from 'zustand';

/** `account` is the full-screen account hub; the rest are bottom sheets. */
export type SheetName = 'cart' | 'tracking' | 'login' | 'details' | 'account' | 'coupons';

/** `choose` lists every way in; `signup` and `login` are the email forms. */
export type LoginMode = 'choose' | 'signup' | 'login';

export interface LoginOptions {
  mode?: LoginMode;
  /** Website orders need an account, so the sheet offers no guest way out. */
  required?: boolean;
}

interface UiState {
  open: Record<SheetName, boolean>;
  /** Why the sign-in sheet opened ("Sign in to save favourites"); null shows the general pitch. */
  loginReason: string | null;
  loginMode: LoginMode;
  loginRequired: boolean;
  /** The account page to open straight to (a notification tap opens the inbox). */
  hubStart: 'inbox' | null;
  /** `welcome` straight after Google sign-in, `checkout` when paying needs a mobile number. */
  detailsMode: 'welcome' | 'checkout';
  showDetails: (mode: 'welcome' | 'checkout') => void;
  show: (sheet: SheetName) => void;
  hide: (sheet: SheetName) => void;
  showLogin: (reason?: string, options?: LoginOptions) => void;
  showHub: (start?: 'inbox') => void;
}

export const useUi = create<UiState>()((set) => ({
  open: { cart: false, tracking: false, login: false, details: false, account: false, coupons: false },
  loginReason: null,
  loginMode: 'choose',
  loginRequired: false,
  hubStart: null,
  detailsMode: 'checkout',
  showDetails: (mode) => set((s) => ({ detailsMode: mode, open: { ...s.open, details: true } })),
  show: (sheet) => set((s) => ({ open: { ...s.open, [sheet]: true } })),
  hide: (sheet) => set((s) => ({ open: { ...s.open, [sheet]: false } })),
  showLogin: (reason, options) =>
    set((s) => ({
      loginReason: reason ?? null,
      loginMode: options?.mode ?? 'choose',
      loginRequired: options?.required ?? false,
      open: { ...s.open, login: true },
    })),
  showHub: (start) => set((s) => ({ hubStart: start ?? null, open: { ...s.open, account: true } })),
}));
