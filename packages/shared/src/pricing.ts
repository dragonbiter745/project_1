import type { OrderTotals, GlobalConfig } from './types';
import { calculateSubtotalPaise } from './money';

export interface ComputeOrderTotalsOptions {
  items: Array<{ pricePaise: number; qty: number }>;
  config: GlobalConfig;
}

export function computeOrderTotals({
  items,
  config,
}: ComputeOrderTotalsOptions): OrderTotals {
  const subtotalPaise = calculateSubtotalPaise(items);
  let taxPaise = 0;

  if (config.taxInclusive) {
    // Menu prices already include GST. Extract tax component.
    taxPaise = Math.round(
      subtotalPaise - subtotalPaise / (1 + config.gstPct / 100)
    );
  } else {
    // Add GST on top of subtotal
    taxPaise = Math.round((subtotalPaise * config.gstPct) / 100);
  }

  const platformFeePaise = config.platformFeePaise || 0;
  const totalPaise = config.taxInclusive
    ? subtotalPaise + platformFeePaise
    : subtotalPaise + taxPaise + platformFeePaise;

  return {
    subtotalPaise,
    taxPaise,
    platformFeePaise,
    totalPaise,
  };
}

export function calculatePointsEarned(
  subtotalPaise: number,
  pointsPerRupee: number = 0.1
): number {
  const rupeesSpent = Math.floor(subtotalPaise / 100);
  return Math.floor(rupeesSpent * pointsPerRupee);
}
