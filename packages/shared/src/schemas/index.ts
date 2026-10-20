import { z } from 'zod';

/** Unguessable per-table token from the QR (base64url, 22+ chars). Short table codes are no longer accepted. */
export const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

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
