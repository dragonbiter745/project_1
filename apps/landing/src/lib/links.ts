/** The real diner app. Diners reach it only by scanning the secure QR on their table. */
export const CUSTOMER_URL = (import.meta.env.VITE_CUSTOMER_URL ?? 'https://reva-nest-foodcourt.web.app').replace(/\/$/, '');

/**
 * Every table's QR carries an unguessable token, so there is no public "order here" link to share.
 * Ordering CTAs lead to the explanation of how to order: scan the QR on any table.
 */
export const orderAtTable = () => '#story';
