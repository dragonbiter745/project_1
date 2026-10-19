import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export interface CartLine {
  shopId: string;
  itemId: string;
  qty: number;
}

export interface PastOrder {
  at: number;
  tokens: string[];
  totalPaise: number;
  lines: CartLine[];
}

interface CartState {
  lines: CartLine[];
  history: PastOrder[];
  add: (shopId: string, itemId: string, delta: number) => void;
  replace: (lines: CartLine[]) => void;
  clear: () => void;
  remember: (order: PastOrder) => void;
}

// Private windows and blocked storage throw; the cart then simply lives for this visit.
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // ignore
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  },
};

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      history: [],
      add: (shopId, itemId, delta) =>
        set((s) => {
          const found = s.lines.find((l) => l.shopId === shopId && l.itemId === itemId);
          if (!found) return delta > 0 ? { lines: [...s.lines, { shopId, itemId, qty: Math.min(10, delta) }] } : s;
          const qty = Math.max(0, Math.min(10, found.qty + delta));
          return { lines: qty === 0 ? s.lines.filter((l) => l !== found) : s.lines.map((l) => (l === found ? { ...l, qty } : l)) };
        }),
      replace: (lines) => set({ lines }),
      clear: () => set({ lines: [] }),
      remember: (order) => set((s) => ({ history: [order, ...s.history].slice(0, 6) })),
    }),
    { name: 'reva-landing-cart', storage: createJSONStorage(() => safeStorage), version: 1 }
  )
);
