/** The real diner app. QR plates on each table open `${CUSTOMER_URL}/t/<table>`. */
export const CUSTOMER_URL = (import.meta.env.VITE_CUSTOMER_URL ?? 'https://reva-nest-foodcourt.web.app').replace(/\/$/, '');
export const orderAtTable = (table = 'T14') => `${CUSTOMER_URL}/t/${table}`;
