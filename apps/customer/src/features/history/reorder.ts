import type { CartItem, Order } from '@foodcourt/shared';
import type { FoodCourtDataState } from '@foodcourt/firebase-client/state';

export interface ReorderPlan {
  lines: CartItem[];
  skipped: string[];
}

// Names and prices come from today's menu, not the old order; the server re-prices anyway.
export function planReorder(order: Order, state: FoodCourtDataState): ReorderPlan {
  const lines: CartItem[] = [];
  const skipped: string[] = [];
  for (const item of order.items) {
    const vendor = state.vendors.find((v) => v.id === item.vendorId);
    const menuItem = state.menus[item.vendorId]?.categories
      .flatMap((c) => c.items)
      .find((i) => i.id === item.itemId);
    const soldOut = Boolean(state.availability[item.vendorId]?.unavailable?.[item.itemId]);
    if (!vendor?.acceptingOrders || !menuItem || soldOut) {
      skipped.push(item.name);
      continue;
    }
    lines.push({
      id: menuItem.id,
      itemId: menuItem.id,
      vendorId: item.vendorId,
      name: menuItem.name,
      pricePaise: menuItem.pricePaise,
      veg: menuItem.veg,
      qty: item.qty,
      note: item.note,
    });
  }
  return { lines, skipped };
}
