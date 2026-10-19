import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_ORDERS = 30;

// Orders placed on this phone, so history and reorder work across visits before
// server-side accounts exist (PRD FR-C9 lands fully with phone login in M5).
interface OrderHistoryState {
  orderIds: string[];
  record: (orderId: string) => void;
}

export const useOrderHistory = create<OrderHistoryState>()(
  persist(
    (set) => ({
      orderIds: [],
      record: (orderId) =>
        set((s) => ({ orderIds: [orderId, ...s.orderIds.filter((id) => id !== orderId)].slice(0, MAX_ORDERS) })),
    }),
    { name: 'fc_order_history_v1', version: 1, partialize: (s) => ({ orderIds: s.orderIds }) }
  )
);
