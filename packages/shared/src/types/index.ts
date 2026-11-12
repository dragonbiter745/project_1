// Status & lifecycle types
export type OrderStatus =
  | 'CREATED'
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'FAILED'
  | 'EXPIRED'
  | 'COMPLETED'
  | 'PARTIALLY_REFUNDED'
  /** Paid, but every shop's part failed and was refunded: nothing was served. */
  | 'REFUNDED'
  | 'CANCELLED';

export type SubOrderStatus =
  | 'NEW'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'COLLECTED'
  | 'REJECTED'
  | 'TIMED_OUT'
  | 'CANCELLED';

export type PaymentStatus =
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED'
  | 'USER_DROPPED'
  | 'REFUNDED'
  /** The amount Razorpay captured is not the order total: never fulfilled, refunded in full. */
  | 'FLAGGED';

export type UserRole = 'master' | 'vendorFinance' | 'vendorAdmin' | 'vendorStaff' | 'customer';

// Venue & Vendor
export interface Venue {
  id: string;
  name: string;
  timezone: string;
  taxConfig: {
    gstPct: number;
    taxInclusive: boolean;
  };
  sessionTtlMin: number;
}

export interface Vendor {
  id: string;
  name: string;
  code: string; // e.g. "RM", "SV"
  logoUrl?: string;
  status: 'active' | 'suspended';
  acceptingOrders: boolean;
  pausedUntil?: string | null;
  defaultPrepMin: number;
  fulfilmentMode: 'pickup' | 'table_service';
  acceptSlaSec: number;
  razorpayAccountId?: string;
  feePct: number;
  perOrderFeePaise: number;
  hours: {
    open: string;
    close: string;
  };
}

// Menu structures
export interface MenuItem {
  id: string;
  name: string;
  pricePaise: number; // Integer paise
  veg: boolean;
  desc?: string;
  imageUrl?: string;
  tags?: string[];
  prepMin?: number;
  sort: number;
}

export interface MenuCategory {
  id: string;
  name: string;
  sort: number;
  items: MenuItem[];
}

export interface VendorMenu {
  vendorId: string;
  version: number;
  categories: MenuCategory[];
  updatedAt: number;
}

export interface VendorAvailability {
  vendorId: string;
  unavailable: Record<string, boolean>; // itemId -> true if out of stock
  updatedAt: number;
}

// Table & Session
export interface Table {
  id: string;
  code: string; // short human code printed on the stand, e.g. "T14"; never accepted on its own
  /** Unguessable token embedded in the QR link; only the server and the master console see it. */
  qrToken?: string;
  label: string; // e.g. "T-14"
  zone: string;
  capacity?: number; // 4 or 6 seater
  active: boolean;
}

export interface Session {
  id: string;
  uid: string;
  tableId: string;
  tableLabel: string;
  dateKey: string; // YYYY-MM-DD
  dailyNo: number; // Daily customer sequence
  displayName: string; // "Zesty Mango"
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
  linkedUserId?: string;
}

// Cart & Orders
export interface CartItem {
  id: string; // Unique instance id in cart
  itemId: string;
  vendorId: string;
  name: string;
  pricePaise: number;
  veg: boolean;
  qty: number;
  note?: string;
}

export interface OrderItemRecord {
  itemId: string;
  vendorId: string;
  /** The menu category the dish was in when ordered (for analytics and category coupons). */
  categoryId?: string;
  name: string;
  pricePaise: number;
  veg: boolean;
  qty: number;
  note?: string;
}

export interface OrderTotals {
  subtotalPaise: number;
  taxPaise: number;
  platformFeePaise: number;
  /** Coupon discount, paid by the court; already taken off totalPaise. */
  discountPaise?: number;
  totalPaise: number;
}

export interface OrderCoupon {
  code: string;
  title: string;
  discountPaise: number;
  /** The use was handed back because every shop's part was refunded. */
  released?: boolean;
}

export interface Order {
  id: string;
  sessionId: string;
  uid: string;
  tableId: string;
  tableLabel: string;
  dateKey: string;
  items: OrderItemRecord[];
  totals: OrderTotals;
  payment: {
    rzpOrderId?: string;
    rzpPaymentId?: string;
    method?: string;
    status: PaymentStatus;
    paidAt?: number;
    /** ONLINE goes through Razorpay; COUNTER is paid at collection. */
    mode?: 'ONLINE' | 'COUNTER';
  };
  status: OrderStatus;
  checkoutKey: string;
  createdAt: number;
  updatedAt?: number;
  /** Unpaid online orders expire at this time. */
  expiresAt?: number;
  /** Each shop's commission terms when the order was placed (older orders fall back to the shop's current terms). */
  commissionTerms?: Record<string, { feePct: number; perOrderFeePaise: number }>;
  /** When the sweeper expired it; a payment can still land for a while after, so it keeps being checked. */
  expiredAt?: number;
  /**
   * Money Razorpay captured for an order that could not be fulfilled (the order had expired, or the
   * amount was wrong). It is sent straight back in full.
   */
  lateRefund?: {
    status: 'PENDING' | 'PROCESSED' | 'FAILED';
    reason: 'late' | 'amount-mismatch';
    amountPaise: number;
    paymentId: string;
    refundId: string;
    gatewayRefundId?: string;
    createdAt: number;
    updatedAt?: number;
  };
  coupon?: OrderCoupon;
}

export interface SubOrderTimeline {
  placed: number;
  accepted?: number;
  preparing?: number;
  ready?: number;
  collected?: number;
  rejected?: number;
  timedOut?: number;
  cancelled?: number;
}

export interface SubOrder {
  id: string;
  orderId: string;
  /** The diner's auth uid, so they can read their own tickets. */
  uid?: string;
  sessionId?: string;
  tableId?: string;
  dateKey?: string;
  vendorId: string;
  vendorName?: string;
  token: string; // e.g. "RM-042"
  tableLabel: string;
  customerDisplay: string; // "Zesty Mango · #042"
  items: Array<{
    id: string;
    name: string;
    qty: number;
    pricePaise: number;
    note?: string;
  }>;
  subtotalPaise: number;
  /** How the diner paid: ONLINE money reaches the court, COUNTER money stays with the shop. */
  paymentMode?: 'ONLINE' | 'COUNTER';
  /** Court commission on this ticket, fixed at creation from the shop's rate. */
  commissionPaise?: number;
  status: SubOrderStatus;
  ts: SubOrderTimeline;
  rejectReason?: string;
  cancelReason?: string;
  prepTimeOverrideMin?: number;
  refund?: {
    /** REQUIRED: owed, written with the status change that failed the ticket; not yet claimed or sent. */
    status: 'REQUIRED' | 'PENDING' | 'PROCESSED' | 'FAILED' | 'NOT_REQUIRED';
    amountPaise: number;
    refundId?: string;
    gatewayRefundId?: string;
    /** Manager retries of a failed refund; each gets a new refundId. */
    attempt?: number;
    failReason?: string;
    updatedAt?: number;
  };
}

// User & Loyalty
export interface UserProfile {
  uid: string;
  phone?: string;
  name?: string;
  pointsBalance: number;
  lifetimeSpendPaise: number;
  tier?: 'bronze' | 'silver' | 'gold';
  createdAt: number;
  /** True once the diner signs in with Google; guests (anonymous uids) never have it. */
  member?: boolean;
  email?: string | null;
  photoURL?: string | null;
  studentId?: string;
  prefs?: UserPrefs;
  /** Saved dishes as `${vendorId}:${itemId}`. */
  favourites?: string[];
  lastLoginAt?: number;
  updatedAt?: number;
  /** Latest consent given; every change is also appended to consentLog (server-only). */
  consent?: UserConsent;
  /** Set on a guest uid whose orders were moved into a signed-in account. */
  mergedInto?: string;
}

/** Consent the diner gave, and when (DPDP Act s.6: the fiduciary must be able to prove it). */
export interface UserConsent {
  /** Agreed to the Terms and Privacy Policy. `adult` exists only on records made before 2026-11-04. */
  terms?: { version: string; at: number; adult?: true };
  /** Offers and announcements: separate, optional, off unless switched on. */
  offers?: { granted: boolean; version: string; at: number };
}

/** One append-only row in consentLog. Kept after account deletion as proof, with the uid only. */
export interface ConsentLogEntry {
  uid: string;
  purpose: 'terms' | 'offers';
  granted: boolean;
  version: string;
  at: number;
  /** How it was given, e.g. the sign-in provider or "settings". */
  source: string;
}

export interface UserPrefs {
  /** Open the menu with Veg only switched on. */
  vegOnly?: boolean;
  /** Consent to offers and announcements (push now, email later). */
  offers?: boolean;
  /** Push when food is ready or an order changes. */
  orderUpdates?: boolean;
}

export const MAX_FAVOURITES = 200;
export const favouriteKey = (vendorId: string, itemId: string) => `${vendorId}:${itemId}`;

export interface PointsLedgerEntry {
  id: string;
  uid: string;
  orderId?: string;
  subOrderId?: string;
  type: 'earn' | 'redeem' | 'adjust' | 'expire';
  points: number;
  createdAt: number;
  notes?: string;
}

// Global System Configuration
export interface GlobalConfig {
  pointsPerRupee: number; // default 0.1 = 1 point per 10 rupees
  pointsExpiryDays: number;
  gstPct: number;
  taxInclusive: boolean;
  platformFeePaise: number;
  flags: {
    paymentsEnabled: boolean;
    loyaltyEnabled: boolean;
    maintenance: boolean;
  };
}
