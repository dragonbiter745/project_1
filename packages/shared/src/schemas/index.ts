import { z } from 'zod';

export const StartSessionSchema = z.object({
  tableCode: z.string().min(1, 'Table code is required'),
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
  sessionId: z.string().min(1),
  checkoutKey: z.string().min(1),
  items: z.array(CartItemSchema).min(1, 'Cart cannot be empty'),
  customerPhone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number').nullish(),
});

export type CreateCheckoutInput = z.infer<typeof CreateCheckoutSchema>;

export const VendorActionSchema = z.object({
  subOrderId: z.string().min(1),
  action: z.enum(['ACCEPT', 'REJECT', 'PREPARING', 'READY', 'COLLECTED']),
  prepTimeOverrideMin: z.number().int().min(1).max(120).optional(),
  rejectReason: z.string().max(250).optional(),
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

export const ReportIssueSchema = z.object({
  orderId: z.string().optional(),
  subOrderId: z.string().optional(),
  vendorId: z.string().optional(),
  text: z.string().min(5).max(1000),
});

export type ReportIssueInput = z.infer<typeof ReportIssueSchema>;
