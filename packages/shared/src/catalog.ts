import type { GlobalConfig, Vendor, VendorMenu } from './types/index';

/**
 * What the diner's app downloads (see functions/src/catalog.ts): a heavy part that changes only when
 * shops or menus are edited, and a small part that moves during service. Both are cached by the CDN.
 */
export type CatalogVendor = Vendor & { id: string };

/** Shops and menus. `v` changes exactly when this content does, so a versioned URL can be cached for a day. */
export interface CatalogData {
  v: string;
  builtAt: number;
  vendors: CatalogVendor[];
  menus: Record<string, VendorMenu>;
}

/** Stock, pauses and flags, plus the version of the data the diner should hold. */
export interface CatalogStatus {
  v: string;
  builtAt: number;
  vendors: Record<string, { acceptingOrders?: boolean; pausedUntil?: number | null }>;
  availability: Record<string, { vendorId: string; unavailable: Record<string, boolean>; updatedAt?: number }>;
  config: GlobalConfig | null;
}
