import { create } from 'zustand';

export type SheetName = 'cart' | 'tracking' | 'login' | 'account';

interface UiState {
  open: Record<SheetName, boolean>;
  show: (sheet: SheetName) => void;
  hide: (sheet: SheetName) => void;
}

export const useUi = create<UiState>()((set) => ({
  open: { cart: false, tracking: false, login: false, account: false },
  show: (sheet) => set((s) => ({ open: { ...s.open, [sheet]: true } })),
  hide: (sheet) => set((s) => ({ open: { ...s.open, [sheet]: false } })),
}));
