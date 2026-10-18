/**
 * Money utilities adhering to strict integer-paise representation.
 * 1 INR = 100 paise. Floats are never used in financial calculations.
 */

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function formatPaise(paise: number, includeDecimals = false): string {
  const rupees = paise / 100;
  if (!includeDecimals && Number.isInteger(rupees)) {
    return `₹${rupees.toLocaleString('en-IN')}`;
  }
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function calculateSubtotalPaise(
  items: Array<{ pricePaise: number; qty: number }>
): number {
  return items.reduce((acc, item) => acc + item.pricePaise * item.qty, 0);
}
