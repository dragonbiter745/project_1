import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, MenuItem } from '@foodcourt/shared';

type AddableItem = Pick<MenuItem, 'id' | 'name' | 'pricePaise' | 'veg'>;

interface CartState {
  items: Record<string, CartItem>;
  activeOrderId: string | null;
  add: (item: AddableItem, vendorId: string) => void;
  decrement: (itemId: string) => void;
  setNote: (itemId: string, note: string) => void;
  restore: (items: CartItem[]) => void;
  clear: () => void;
  setActiveOrder: (orderId: string | null) => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: {},
      activeOrderId: null,
      add: (item, vendorId) =>
        set((s) => {
          const existing = s.items[item.id];
          const next: CartItem = existing
            ? { ...existing, qty: existing.qty + 1 }
            : {
                id: item.id,
                itemId: item.id,
                vendorId,
                name: item.name,
                pricePaise: item.pricePaise,
                veg: item.veg,
                qty: 1,
              };
          return { items: { ...s.items, [item.id]: next } };
        }),
      decrement: (itemId) =>
        set((s) => {
          const existing = s.items[itemId];
          if (!existing) return s;
          const items = { ...s.items };
          if (existing.qty <= 1) delete items[itemId];
          else items[itemId] = { ...existing, qty: existing.qty - 1 };
          return { items };
        }),
      setNote: (itemId, note) =>
        set((s) => {
          const existing = s.items[itemId];
          if (!existing) return s;
          return { items: { ...s.items, [itemId]: { ...existing, note } } };
        }),
      restore: (restored) =>
        set((s) => ({
          items: { ...s.items, ...Object.fromEntries(restored.map((i) => [i.itemId, i])) },
        })),
      clear: () => set({ items: {} }),
      setActiveOrder: (activeOrderId) => set({ activeOrderId }),
    }),
    {
      name: 'fc_cart_v1',
      version: 1,
      partialize: (s) => ({ items: s.items, activeOrderId: s.activeOrderId }),
    }
  )
);

export const selectCartCount = (s: CartState): number =>
  Object.values(s.items).reduce((n, i) => n + i.qty, 0);
