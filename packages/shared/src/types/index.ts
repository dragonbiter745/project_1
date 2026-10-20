// Status & lifecycle types
export type OrderStatus =
  | 'CREATED'
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'FAILED'
  | 'EXPIRED'
  | 'COMPLETED'
  | 'PARTIALLY_REFUNDED'
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
  | 'REFUNDED';

export type UserRole = 'master' | 'finance' | 'vendorAdmin' | 'vendorStaff' | 'customer';

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
  cashfreeVendorId?: string;
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
  totalPaise: number;
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
    cfOrderId?: string;
    cfPaymentId?: string;
    paymentSessionId?: string;
    method?: string;
    status: PaymentStatus;
    paidAt?: number;
    /** ONLINE goes through Cashfree; COUNTER is paid at collection. */
    mode?: 'ONLINE' | 'COUNTER';
  };
  status: OrderStatus;
  checkoutKey: string;
  createdAt: number;
  updatedAt?: number;
  /** Unpaid online orders expire at this time. */
  expiresAt?: number;
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
    status: 'PENDING' | 'PROCESSED' | 'FAILED' | 'NOT_REQUIRED';
    amountPaise: number;
    refundId?: string;
    cfRefundId?: string;
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
}

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
