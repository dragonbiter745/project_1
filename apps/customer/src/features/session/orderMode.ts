/**
 * `table`: opened from a table's QR (/t/{token}); guests can order and collect at the table's shops.
 * `web`: the normal website; browsing is open, ordering needs an account and is collected at the
 * counter. Fixed for the life of the page.
 */
export type OrderMode = 'table' | 'web';

export const ORDER_MODE: OrderMode = window.location.pathname.startsWith('/t/') ? 'table' : 'web';

export const isWebMode = ORDER_MODE === 'web';

/** The landing page with the 3D court; the website's Qrave logo links back to it. */
export const LANDING_URL = ((import.meta.env.VITE_LANDING_URL as string | undefined) ?? 'https://getqrave.in').replace(/\/$/, '');

const LAST_TABLE_KEY = 'fc_last_table';
// A table is "yours" for about as long as a session lasts; after that the site opens as the website.
const LAST_TABLE_MS = 3 * 60 * 60 * 1000;

export function rememberTable(token: string): void {
  try {
    localStorage.setItem(LAST_TABLE_KEY, JSON.stringify({ token, at: Date.now() }));
  } catch {
    // storage blocked: a home-screen launch opens the website instead
  }
}

export function forgetTable(token: string): void {
  try {
    if (recentTable() === token) localStorage.removeItem(LAST_TABLE_KEY);
  } catch {
    // ignore
  }
}

/** The table this phone scanned in the last few hours, if any. */
export function recentTable(): string | null {
  try {
    const raw = localStorage.getItem(LAST_TABLE_KEY);
    if (!raw?.startsWith('{')) return null;
    const { token, at } = JSON.parse(raw) as { token?: unknown; at?: unknown };
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
    return typeof at === 'number' && Date.now() - at < LAST_TABLE_MS ? token : null;
  } catch {
    return null;
  }
}
