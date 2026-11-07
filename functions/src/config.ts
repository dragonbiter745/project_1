import { defineBoolean, defineSecret, defineString } from 'firebase-functions/params';

export const REGION = 'asia-south1';
/** Firestore lives in the named database "default" (not "(default)"). */
export const DATABASE = 'default';

// Razorpay: the key id is public (the checkout window needs it); the secrets live in Secret Manager, never in code.
// A rzp_live_ key id means live payments, rzp_test_ means test mode, so switching is a key swap, not a code change.
export const RAZORPAY_KEY_ID = defineString('RAZORPAY_KEY_ID', { default: '' });
export const RAZORPAY_KEY_SECRET = defineSecret('RAZORPAY_KEY_SECRET');
/** Set in the Razorpay dashboard when the webhook is created; it is not the API key secret. */
export const RAZORPAY_WEBHOOK_SECRET = defineSecret('RAZORPAY_WEBHOOK_SECRET');
export const CUSTOMER_URL = defineString('CUSTOMER_URL', { default: 'https://order.getqrave.in' });

// Vendor logins by email (Resend). The key lives in Secret Manager; the sender address must be on a domain verified in Resend.
export const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
export const MAIL_FROM = defineString('MAIL_FROM', { default: 'Qrave <accounts@getqrave.in>' });
/** Where the emailed set-password link lands: kitchen logins open the kitchen display, finance logins shop admin. */
export const VENDOR_URL = defineString('VENDOR_URL', { default: 'https://reva-nest-vendor.web.app' });
export const SHOP_ADMIN_URL = defineString('SHOP_ADMIN_URL', { default: 'https://reva-nest-admin.web.app' });
/** Public home of the logo used inside emails (mail clients cannot load app assets). */
export const BRAND_URL = defineString('BRAND_URL', { default: 'https://getqrave.in' });

export const RAZORPAY_SECRETS = [RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET];

/**
 * Firebase App Check on the diner-facing callables: only the real apps (proved by a reCAPTCHA token) may call them,
 * which stops scripts that bypass the website. Off until the apps ship a site key (see docs/runbook.md section 9),
 * because turning it on first would lock out every phone that has no token yet.
 */
export const APP_CHECK_ENFORCE = defineBoolean('APP_CHECK_ENFORCE', { default: false });

export const isEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';

export function projectId(): string {
  return process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? 'reva-nest-foodcourt';
}

/** How long a kitchen has to accept a new ticket before it times out (PRD default). */
export const DEFAULT_ACCEPT_SLA_SEC = 180;
/** Unpaid online orders stop being payable after this long (Razorpay orders do not expire on their own, so the sweeper expires them). */
export const PAYMENT_WINDOW_MS = 20 * 60 * 1000;
export const SESSION_TTL_MS = 3 * 60 * 60 * 1000;
