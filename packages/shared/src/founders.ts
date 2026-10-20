// Founder books: capital each partner puts in, what the startup spends, what partners take out,
// and how the court's income (commission) is shared. All money is integer paise; shares are
// basis points (10,000 = 100%) so splits never use floats.

export interface Partner {
  id: string;
  name: string;
  /** Share of profit in basis points; all partners add up to 10,000. */
  shareBps: number;
}

export const DEFAULT_PARTNERS: Partner[] = [
  { id: 'dibya', name: 'Dibya', shareBps: 3334 },
  { id: 'manash', name: 'Manash', shareBps: 3333 },
  { id: 'sahil', name: 'Sahil Shingh', shareBps: 3333 },
];

export const EXPENSE_CATEGORIES = [
  { key: 'hardware', label: 'Hardware and equipment' },
  { key: 'software', label: 'Software and cloud' },
  { key: 'printing', label: 'Printing and QR stickers' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'staff', label: 'Staff and helpers' },
  { key: 'rent', label: 'Rent and utilities' },
  { key: 'fees', label: 'Gateway and bank fees' },
  { key: 'legal', label: 'Legal and registration' },
  { key: 'travel', label: 'Travel and logistics' },
  { key: 'other', label: 'Other' },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['key'];
export const expenseLabel = (k: string) => EXPENSE_CATEGORIES.find((c) => c.key === k)?.label ?? 'Other';

/**
 * CAPITAL: a partner puts money into the startup. DRAWING: a partner takes money out.
 * EXPENSE: the startup spends money; `paidBy` is a partner id when they paid from their own pocket
 * (that counts as money they put in), or "court" when it came from the startup's account.
 */
export interface FounderEntry {
  id: string;
  kind: 'CAPITAL' | 'DRAWING' | 'EXPENSE';
  amountPaise: number;
  /** YYYY-MM-DD (IST). */
  date: string;
  partnerId?: string;
  category?: ExpenseCategory;
  paidBy?: string;
  note?: string;
  reference?: string;
  status: 'RECORDED' | 'VOID';
  createdAt: number;
  createdBy: string;
  voidedAt?: number;
  voidReason?: string;
}

/** Splits an amount by share so the parts always add back to the exact amount (largest remainder). */
export function splitByShare(amountPaise: number, partners: Partner[]): Record<string, number> {
  const total = partners.reduce((n, p) => n + p.shareBps, 0) || 1;
  const raw = partners.map((p) => ({ id: p.id, exact: (amountPaise * p.shareBps) / total }));
  const out: Record<string, number> = Object.fromEntries(raw.map((r) => [r.id, Math.trunc(r.exact)]));
  let left = amountPaise - Object.values(out).reduce((n, v) => n + v, 0);
  const order = [...raw].sort((a, b) => Math.abs(b.exact - Math.trunc(b.exact)) - Math.abs(a.exact - Math.trunc(a.exact)));
  for (let i = 0; left !== 0 && order.length > 0; i = (i + 1) % order.length) {
    const step = left > 0 ? 1 : -1;
    out[order[i]!.id] = (out[order[i]!.id] ?? 0) + step;
    left -= step;
  }
  return out;
}

export interface PartnerBook {
  partner: Partner;
  capitalPaise: number;
  /** Startup expenses this partner paid personally. */
  expensesPaidPaise: number;
  drawingsPaise: number;
  profitSharePaise: number;
  /** Capital + expenses paid + profit share − drawings. Negative means they took out more than they are owed. */
  balancePaise: number;
}

export interface FounderBooks {
  incomePaise: number;
  expensesPaise: number;
  netProfitPaise: number;
  /** Capital put in, including expenses partners paid personally. */
  capitalPaise: number;
  drawingsPaise: number;
  /** Profit kept in the startup after partner drawings. */
  retainedPaise: number;
  partners: PartnerBook[];
  /** True when no partner has drawn more than their capital plus profit share. */
  balanced: boolean;
}

/** The books for one window: `incomePaise` is the court's commission for the same window. */
export function computeFounderBooks(entries: FounderEntry[], partners: Partner[], incomePaise: number, window?: { from: string; to: string }): FounderBooks {
  const live = entries.filter((e) => e.status === 'RECORDED' && (!window || (e.date >= window.from && e.date <= window.to)));
  const sum = (pred: (e: FounderEntry) => boolean) => live.filter(pred).reduce((n, e) => n + e.amountPaise, 0);
  const expensesPaise = sum((e) => e.kind === 'EXPENSE');
  const netProfitPaise = incomePaise - expensesPaise;
  const shares = splitByShare(netProfitPaise, partners);
  const books = partners.map((p) => {
    const capitalPaise = sum((e) => e.kind === 'CAPITAL' && e.partnerId === p.id);
    const expensesPaidPaise = sum((e) => e.kind === 'EXPENSE' && e.paidBy === p.id);
    const drawingsPaise = sum((e) => e.kind === 'DRAWING' && e.partnerId === p.id);
    const profitSharePaise = shares[p.id] ?? 0;
    return { partner: p, capitalPaise, expensesPaidPaise, drawingsPaise, profitSharePaise, balancePaise: capitalPaise + expensesPaidPaise + profitSharePaise - drawingsPaise };
  });
  const drawingsPaise = books.reduce((n, b) => n + b.drawingsPaise, 0);
  return {
    incomePaise,
    expensesPaise,
    netProfitPaise,
    capitalPaise: books.reduce((n, b) => n + b.capitalPaise + b.expensesPaidPaise, 0),
    drawingsPaise,
    retainedPaise: netProfitPaise - drawingsPaise,
    partners: books,
    balanced: books.every((b) => b.balancePaise >= 0),
  };
}

export interface FounderIncome {
  /** Court commission since the start, after failed orders. */
  lifetimeIncomePaise: number;
  /** Court commission per calendar month (YYYY-MM), oldest first. */
  months: Array<{ month: string; incomePaise: number }>;
}
