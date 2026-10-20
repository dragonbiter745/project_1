import { defineSecret, defineString } from 'firebase-functions/params';

export const REGION = 'asia-south1';
/** Firestore lives in the named database "default" (not "(default)"). */
export const DATABASE = 'default';

// Cashfree credentials live in Secret Manager, never in env files or code.
export const CASHFREE_APP_ID = defineSecret('CASHFREE_APP_ID');
export const CASHFREE_SECRET_KEY = defineSecret('CASHFREE_SECRET_KEY');
/** SANDBOX or PRODUCTION. Switching to live payments is a param change plus production secrets. */
export const CASHFREE_ENV = defineString('CASHFREE_ENV', { default: 'SANDBOX' });
export const CUSTOMER_URL = defineString('CUSTOMER_URL', { default: 'https://reva-nest-foodcourt.web.app' });

export const CASHFREE_SECRETS = [CASHFREE_APP_ID, CASHFREE_SECRET_KEY];

export const isEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';

export function projectId(): string {
  return process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? 'reva-nest-foodcourt';
}

/** How long a kitchen has to accept a new ticket before it times out (PRD default). */
export const DEFAULT_ACCEPT_SLA_SEC = 180;
/** Unpaid online orders stop being payable after this long. */
export const PAYMENT_WINDOW_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 3 * 60 * 60 * 1000;
