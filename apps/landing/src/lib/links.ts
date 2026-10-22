/** The diner site: shops and menus for online pickup orders, and the table flow behind each QR. */
export const CUSTOMER_URL = (import.meta.env.VITE_CUSTOMER_URL ?? 'https://reva-nest-foodcourt.web.app').replace(/\/$/, '');

/**
 * Every table's QR carries an unguessable token, so there is no public "order here" link to share.
 * Ordering CTAs lead to the explanation of how to order: scan the QR on any table.
 */
export const orderAtTable = () => '#story';

/** Online ordering for pickup on the diner site (sign-in needed); at a table, the QR is still the way in. */
export const orderOnline = () => CUSTOMER_URL;
