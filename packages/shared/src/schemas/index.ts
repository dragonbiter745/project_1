import { z } from 'zod';
import { QR_TOKEN_PATTERN } from '../tables';


export const StartSessionSchema = z.object({
  qrToken: z.string().regex(QR_TOKEN_PATTERN, 'This table code is not valid. Scan the QR on your table again.'),
});

export type StartSessionInput = z.infer<typeof StartSessionSchema>;

export const CartItemSchema = z.object({
  itemId: z.string().min(1),
  vendorId: z.string().min(1),
  name: z.string().min(1),
  pricePaise: z.number().int().nonnegative(),
  veg: z.boolean(),
  qty: z.number().int().positive().max(50),
  note: z.string().max(120).nullish(),
});

export const CreateCheckoutSchema = z.object({
  sessionId: z.string().min(1).max(200),
  checkoutKey: z.string().min(8).max(80),
  items: z.array(CartItemSchema).min(1, 'Cart cannot be empty').max(40, 'That is too many dishes for one order'),
  // Required by the payment gateway for online payments; the server enforces it when payments are on.
  customerPhone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number').nullish(),
});

export type CreateCheckoutInput = z.infer<typeof CreateCheckoutSchema>;

export const VENDOR_ACTIONS = ['ACCEPT', 'READY', 'UNDO_READY', 'COLLECTED', 'REJECT', 'CANCEL'] as const;
export type VendorActionName = (typeof VENDOR_ACTIONS)[number];

export const VendorActionSchema = z.object({
  subOrderId: z.string().min(1).max(200),
  action: z.enum(VENDOR_ACTIONS),
  prepTimeOverrideMin: z.number().int().min(1).max(120).optional(),
  // Required for REJECT and CANCEL; shown to the diner.
  reason: z.string().trim().min(2).max(200).optional(),
});

export type VendorActionInput = z.infer<typeof VendorActionSchema>;

export const ToggleAvailabilitySchema = z.object({
  vendorId: z.string().min(1),
  itemId: z.string().min(1),
  unavailable: z.boolean(),
});

export type ToggleAvailabilityInput = z.infer<typeof ToggleAvailabilitySchema>;

export const PauseVendorOrdersSchema = z.object({
  vendorId: z.string().min(1),
  pauseDurationMin: z.number().int().min(0).max(1440), // 0 means unpause
});

export type PauseVendorOrdersInput = z.infer<typeof PauseVendorOrdersSchema>;

export const ISSUE_REASONS = ['missing_item', 'wrong_item', 'quality', 'wait', 'payment', 'other'] as const;

export const ReportIssueSchema = z.object({
  orderId: z.string().min(1).max(200),
  subOrderId: z.string().max(200).optional(),
  reason: z.enum(ISSUE_REASONS),
  text: z.string().trim().max(600).optional(),
});

export const AdminActionSchema = z.discriminatedUnion('action', [
  // Gives every table without one an unguessable QR token.
  z.object({ action: z.literal('ENSURE_QR_TOKENS') }),
  // Issues a new token for one table; the old QR stops working immediately.
  z.object({ action: z.literal('ROTATE_QR'), tableId: z.string().min(1).max(100) }),
]);

export type AdminActionInput = z.infer<typeof AdminActionSchema>;

export type ReportIssueInput = z.infer<typeof ReportIssueSchema>;

const DATE_KEY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

export const FinanceReportSchema = z
  .object({ from: DATE_KEY, to: DATE_KEY })
  .refine((r) => r.from <= r.to, 'The start date must be before the end date')
  .refine((r) => Date.parse(r.to) - Date.parse(r.from) <= 400 * 86_400_000, 'Pick a range of about a year or less');

export const FinanceActionSchema = z.discriminatedUnion('action', [
  // Records money sent to a shop; requestKey makes a double submit land once.
  z.object({
    action: z.literal('RECORD_PAYOUT'),
    requestKey: z.string().min(8).max(80),
    vendorId: z.string().min(1).max(100),
    amountPaise: z.number().int().min(100, 'Enter at least ₹1').max(1_000_000_000, 'That amount is too large'),
    paidOn: DATE_KEY,
    reference: z.string().trim().min(3, 'Enter the UTR or UPI reference').max(60),
    note: z.string().trim().max(200).optional(),
  }),
  // Payouts are never deleted: a mistaken one is voided with a reason and stays in the history.
  z.object({ action: z.literal('VOID_PAYOUT'), payoutId: z.string().min(1).max(100), reason: z.string().trim().min(3, 'Say why').max(200) }),
  // Applies to tickets created from now on.
  z.object({
    action: z.literal('SET_COMMISSION'),
    vendorId: z.string().min(1).max(100),
    feePct: z.number().min(0).max(50).multipleOf(0.01),
    perOrderFeePaise: z.number().int().min(0).max(10_000),
  }),
]);

export type FinanceReportInput = z.infer<typeof FinanceReportSchema>;
export type FinanceActionInput = z.infer<typeof FinanceActionSchema>;
