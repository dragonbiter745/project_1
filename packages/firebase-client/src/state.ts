import type { GlobalConfig, InboxMessage, Order, PointsLedgerEntry, Session, SubOrder, Table, UserProfile, Vendor, VendorAvailability, VendorMenu, Venue } from '@foodcourt/shared';

/** The shape every app reads, whether filled by Firestore (production) or the local demo store. */
export interface FoodCourtDataState {
  venue: Venue;
  vendors: Vendor[];
  menus: Record<string, VendorMenu>;
  availability: Record<string, VendorAvailability>;
  tables: Table[];
  sessions: Record<string, Session>;
  orders: Record<string, Order>;
  subOrders: Record<string, SubOrder>;
  users: Record<string, UserProfile>;
  pointsLedger: Record<string, PointsLedgerEntry>;
  config: GlobalConfig;
  dailyCounter: Record<string, number>;
  vendorCounters: Record<string, number>;
  /** A signed-in diner's messages from the court. */
  inbox: Record<string, InboxMessage>;
}

export const DEFAULT_CONFIG: GlobalConfig = {
  pointsPerRupee: 0.1,
  pointsExpiryDays: 90,
  gstPct: 5,
  taxInclusive: true,
  platformFeePaise: 0,
  flags: { paymentsEnabled: true, loyaltyEnabled: false, maintenance: false },
};

export function emptyState(): FoodCourtDataState {
  return {
    venue: { id: 'venue-reva', name: 'REVA Food Court', timezone: 'Asia/Kolkata', taxConfig: { gstPct: 5, taxInclusive: true }, sessionTtlMin: 180 },
    vendors: [],
    menus: {},
    availability: {},
    tables: [],
    sessions: {},
    orders: {},
    subOrders: {},
    users: {},
    pointsLedger: {},
    config: structuredClone(DEFAULT_CONFIG),
    dailyCounter: {},
    vendorCounters: {},
    inbox: {},
  };
}
