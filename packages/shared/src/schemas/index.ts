import { z } from 'zod';
import { QR_TOKEN_PATTERN } from '../tables';
import { COUPON_CODE, normaliseCode } from '../coupons';


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
  // Re-checked from scratch on the server; the phone only says which code the diner entered.
  couponCode: z.string().trim().max(24).nullish(),
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

const ID = z.string().min(1).max(200);

export const AccountActionSchema = z.discriminatedUnion('action', [
  // After Google sign-in. guestToken proves the anonymous uid whose orders should move into this account.
  z.object({ action: z.literal('SYNC'), sessionId: ID.optional(), guestToken: z.string().min(20).max(4096).optional() }),
  z.object({
    action: z.literal('UPDATE_PROFILE'),
    sessionId: ID.optional(),
    name: z.string().trim().min(2, 'Enter at least 2 letters').max(40, 'Keep it under 40 letters').optional(),
    phone: z.union([z.literal(''), z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number')]).optional(),
    studentId: z.string().trim().max(20).optional(),
  }),
  z.object({
    action: z.literal('SET_PREFS'),
    vegOnly: z.boolean().optional(),
    offers: z.boolean().optional(),
    orderUpdates: z.boolean().optional(),
  }),
  z.object({ action: z.literal('FAVOURITE'), vendorId: ID, itemId: ID, on: z.boolean() }),
  z.object({ action: z.literal('DELETE_ACCOUNT'), confirm: z.literal('DELETE') }),
]);

export type AccountActionInput = z.infer<typeof AccountActionSchema>;

const DATE_KEY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

export const FinanceReportSchema = z
  .object({ from: DATE_KEY, to: DATE_KEY })
  .refine((r) => r.from <= r.to, 'The start date must be before the end date')
  .refine((r) => Date.parse(r.to) - Date.parse(r.from) <= 400 * 86_400_000, 'Pick a range of about a year or less');

const ENTRY_FIELDS = {
  kind: z.enum(['CAPITAL', 'DRAWING', 'EXPENSE']),
  amountPaise: z.number().int().min(100, 'Enter at least ₹1').max(1_000_000_000, 'That amount is too large'),
  date: DATE_KEY,
  partnerId: z.string().max(30).optional(),
  category: z.enum(['hardware', 'software', 'printing', 'marketing', 'staff', 'rent', 'fees', 'legal', 'travel', 'other']).optional(),
  paidBy: z.string().max(30).optional(),
  note: z.string().trim().max(200).optional(),
  reference: z.string().trim().max(60).optional(),
};

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
  // Founder books (master console → Finance → Founders).
  z.object({
    action: z.literal('SET_PARTNERS'),
    partners: z
      .array(z.object({ id: z.string().regex(/^[a-z0-9-]{2,30}$/), name: z.string().trim().min(2, 'Enter each name').max(60), shareBps: z.number().int().min(0).max(10_000) }))
      .min(1)
      .max(10)
      .refine((ps) => ps.reduce((n, p) => n + p.shareBps, 0) === 10_000, 'Shares must add up to 100%')
      .refine((ps) => new Set(ps.map((p) => p.id)).size === ps.length, 'Each partner needs a different id'),
  }),
  z.object({ action: z.literal('RECORD_ENTRY'), requestKey: z.string().min(8).max(80), ...ENTRY_FIELDS }),
  z.object({ action: z.literal('VOID_ENTRY'), entryId: z.string().min(1).max(100), reason: z.string().trim().min(3, 'Say why').max(200) }),
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

// ─── Coupons (master edits; diners preview) ─────────────────────────────────

const COUPON_ID = z.string().min(1).max(100);
const CODE = z
  .string()
  .transform(normaliseCode)
  .pipe(z.string().regex(COUPON_CODE, 'Use 3 to 20 letters, numbers or dashes'));

export const CouponInputSchema = z
  .object({
    code: CODE,
    title: z.string().trim().min(3, 'Give it a short title').max(60),
    description: z.string().trim().max(200).optional(),
    kind: z.enum(['PERCENT', 'FLAT']),
    percentBps: z.number().int().min(100, 'At least 1%').max(10_000).optional(),
    flatPaise: z.number().int().min(100, 'At least ₹1').max(1_000_000).optional(),
    maxDiscountPaise: z.number().int().min(100).max(1_000_000).nullable().optional(),
    minOrderPaise: z.number().int().min(0).max(10_000_000),
    scope: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('ALL') }),
      z.object({ kind: z.literal('VENDORS'), vendorIds: z.array(COUPON_ID).min(1, 'Pick at least one shop').max(30) }),
      z.object({ kind: z.literal('CATEGORIES'), categories: z.array(z.object({ vendorId: COUPON_ID, categoryId: COUPON_ID })).min(1, 'Pick at least one category').max(100) }),
    ]),
    audience: z.enum(['EVERYONE', 'MEMBERS']),
    firstOrderOnly: z.boolean(),
    showInWallet: z.boolean(),
    startsAt: z.number().int().min(0),
    endsAt: z.number().int().nullable(),
    totalLimit: z.number().int().min(1).max(1_000_000).nullable(),
    perCustomerLimit: z.number().int().min(1).max(100),
  })
  .refine((c) => (c.kind === 'PERCENT' ? c.percentBps !== undefined : c.flatPaise !== undefined), 'Enter how much the coupon takes off')
  .refine((c) => c.endsAt === null || c.endsAt > c.startsAt, 'The end must be after the start');

export type CouponInput = z.infer<typeof CouponInputSchema>;

export const CouponActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('SAVE'), coupon: CouponInputSchema, create: z.boolean() }),
  z.object({ action: z.literal('SET_ACTIVE'), code: CODE, active: z.boolean() }),
]);

export const PreviewCouponSchema = z.object({ code: CODE });

// ─── Messages ────────────────────────────────────────────────────────────────

const MSG_ID = z.string().min(1).max(128);

export const CampaignAudienceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('MEMBERS') }),
  z.object({ kind: z.literal('REGULARS') }),
  z.object({ kind: z.literal('NEW') }),
  z.object({ kind: z.literal('LAPSED') }),
  z.object({ kind: z.literal('SHOP'), vendorId: MSG_ID }),
  z.object({ kind: z.literal('CATEGORY'), vendorId: MSG_ID, categoryId: MSG_ID }),
  z.object({ kind: z.literal('PEOPLE'), uids: z.array(MSG_ID).min(1, 'Pick at least one diner').max(500) }),
  z.object({ kind: z.literal('KITCHENS'), vendorIds: z.array(MSG_ID).min(1, 'Pick at least one kitchen').max(50) }),
]);

export const CampaignActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ESTIMATE'), audience: CampaignAudienceSchema }),
  z.object({
    action: z.literal('SEND'),
    requestKey: z.string().min(8).max(80),
    title: z.string().trim().min(3, 'Add a title').max(60, 'Keep the title under 60 characters'),
    body: z.string().trim().min(3, 'Write the message').max(240, 'Keep the message under 240 characters'),
    audience: CampaignAudienceSchema,
    couponCode: z.string().trim().max(24).optional(),
    /** Omitted: send now. */
    sendAt: z.number().int().positive().optional(),
  }),
  z.object({ action: z.literal('CANCEL'), campaignId: MSG_ID }),
]);

export type CampaignActionInput = z.infer<typeof CampaignActionSchema>;

export const PushActionSchema = z.object({
  action: z.enum(['REGISTER', 'UNREGISTER']),
  token: z.string().min(20).max(4096),
});

// ─── Shop admin (the owner edits their own menu and settings) ───────────────

const SHOP_ID = z.string().min(1).max(100);
const REQUEST_KEY = z.string().min(8).max(80);
const CLOCK = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time like 09:30');
/** Rupees in the form, paise on the wire: ₹1 to ₹5,000 a dish. */
export const MENU_PRICE_MIN_PAISE = 100;
export const MENU_PRICE_MAX_PAISE = 500_000;

export const ShopAdminActionSchema = z.discriminatedUnion('action', [
  // Adds a dish, or edits one when itemId is given. Without an itemId the id comes from requestKey,
  // so a double tap on "Add dish" lands once.
  z.object({
    action: z.literal('SAVE_ITEM'),
    vendorId: SHOP_ID.optional(),
    requestKey: REQUEST_KEY,
    categoryId: z.string().min(1).max(100),
    itemId: z.string().min(1).max(100).optional(),
    name: z.string().trim().min(2, 'Give the dish a name').max(60, 'Keep the name under 60 letters'),
    pricePaise: z.number().int().min(MENU_PRICE_MIN_PAISE, 'The price must be at least ₹1').max(MENU_PRICE_MAX_PAISE, 'The price cannot be more than ₹5,000'),
    veg: z.boolean(),
    desc: z.string().trim().max(200, 'Keep the description under 200 letters').nullish(),
    imageUrl: z.string().url().max(600).nullish(),
    prepMin: z.number().int().min(1).max(120).nullish(),
  }),
  z.object({ action: z.literal('DELETE_ITEM'), vendorId: SHOP_ID.optional(), itemId: z.string().min(1).max(100) }),
  z.object({
    action: z.literal('SAVE_CATEGORY'),
    vendorId: SHOP_ID.optional(),
    requestKey: REQUEST_KEY,
    categoryId: z.string().min(1).max(100).optional(),
    name: z.string().trim().min(2, 'Give the section a name').max(40, 'Keep the name under 40 letters'),
  }),
  // A section can only be removed once it has no dishes, so a tap never wipes a menu.
  z.object({ action: z.literal('DELETE_CATEGORY'), vendorId: SHOP_ID.optional(), categoryId: z.string().min(1).max(100) }),
  // The new order of sections, or of one section's dishes.
  z.object({
    action: z.literal('REORDER'),
    vendorId: SHOP_ID.optional(),
    categoryId: z.string().min(1).max(100).optional(),
    ids: z.array(z.string().min(1).max(100)).min(1).max(300),
  }),
  z.object({
    action: z.literal('UPDATE_SETTINGS'),
    vendorId: SHOP_ID.optional(),
    open: CLOCK,
    close: CLOCK,
    defaultPrepMin: z.number().int().min(1).max(120),
    fulfilmentMode: z.enum(['pickup', 'table_service']),
    logoUrl: z.string().url().max(600).nullish(),
  }),
  // The owner sets the password of the shop's kitchen (order screen) login.
  z.object({
    action: z.literal('SET_KITCHEN_PASSWORD'),
    vendorId: SHOP_ID.optional(),
    kitchenEmail: z.string().trim().toLowerCase().email('Enter the email the kitchen signs in with'),
    password: z.string().min(8, 'Use at least 8 characters').max(64, 'Use at most 64 characters'),
  }),
]);

export type ShopAdminInput = z.infer<typeof ShopAdminActionSchema>;
