# FoodCourt — Operational Runbook

## 1. Webhook Failures & Payment Triage
- **Symptom:** Diner paid on UPI / Card, but screen stays on "Confirming payment..."
- **Root Causes:**
  1. Cashfree webhook dropped or delayed by PG.
  2. HMAC signature mismatch (secret rotated or timestamp drifted).
- **Resolution Steps:**
  1. The automated scheduled task `reconcilePayments` runs every 2 minutes for orders in `PENDING_PAYMENT` older than 2 minutes. It calls Cashfree Get Order API and marks `PAID` if settled.
  2. In Master Admin (`/live-ops`), search order by `orderId` or customer `dailyNo`.
  3. Click **Force Check Status**: queries Cashfree directly and triggers fulfillment if captured.
  4. If payment failed at PG, client receives `PAYMENT_FAILED` notice and can retry immediately with preserved cart.

## 2. Vendor SLA Timeout & Auto-Refund
- **SLA Rule:** Vendor has 3 minutes (180 seconds, configurable in `vendors/{vendorId}.acceptSlaSec`) to accept an incoming order.
- **Auto-action:**
  - If unaccepted after 180s, `vendorSlaTimeout` marks sub-order `TIMED_OUT`.
  - Cashfree Refund API is dispatched for that sub-order's exact paise amount (`refund_id = sub_{subOrderId}`).
  - Diner receives alert banner + option to re-order from another shop in the court.

## 3. Rush Hour Vendor Management
- **Slammed Kitchen:**
  - Staff taps **Pause Orders** on KDS.
  - Option to select pause duration (15m, 30m, 1h, or indefinite).
  - Customer app instantly greys out vendor with "Roll Me is currently overwhelmed and pausing new orders. Back shortly!".
- **Out of Stock Item:**
  - Staff toggles item switch on KDS.
  - Written optimistically to `availability/{vendorId}` in < 200ms.
  - Customer app greys item out in real time without refreshing.

## 4. Hardware & Connection Failures
- **Tablet Disconnected:**
  - KDS displays persistent offline banner.
  - Upon reconnection, Firestore listener syncs state and replays sound alert for all pending `NEW` tickets.

## 5. CI/CD

### Pipelines
Each area has its own GitHub Actions pipeline and runs only when its files change.

| Pipeline | Watches | On a PR | On `main` |
|---|---|---|---|
| **Frontend · Customer** (`frontend-customer.yml`) | `apps/customer`, shared packages | typecheck, build, 150 KB gz bundle budget, preview channel URL on the PR | deploy to the live customer site |
| **Frontend · Vendor** (`frontend-vendor.yml`) | `apps/vendor`, shared packages | typecheck, build, preview channel | deploy to the live vendor site |
| **Frontend · Master admin** (`frontend-master.yml`) | `apps/master`, shared packages | typecheck, build, preview channel | deploy to the live master site |
| **Backend · Cloud Functions** (`backend-functions.yml`) | `functions/**` | typecheck + build | deploy after approval on `backend-production`; Cashfree keys written to `functions/.env` from environment secrets, deleted after |
| **Firebase · Rules & indexes** (`firebase-rules.yml`) | `firebase/**`, `firebase.json` | compile Firestore + Storage rules in the emulators (`scripts/ci/validate-rules.mjs`), validate indexes JSON | deploy after approval on `firebase-production` |

The three frontends share `_frontend.yml`, and every pipeline uses `.github/actions/setup` (Node 22, pnpm from `packageManager`, cached store, frozen install). Frontend deploys ship the exact artifact the verify job built. Every pipeline can also be run by hand (Actions → pipeline → Run workflow).

### One-time setup (repo admin)
1. **Service account.** In Google Cloud (project `reva-nest-foodcourt`) create a CI service account with: Firebase Hosting Admin, Cloud Functions Admin, Service Account User, Firebase Rules Admin, Cloud Datastore Index Admin, Cloud Build Editor, Artifact Registry Writer, API Keys Viewer. Create a JSON key.
2. **Repo secret** `FIREBASE_SERVICE_ACCOUNT` = that JSON key. Until it exists, verify jobs still run and frontend deploys are skipped with a notice.
3. **Environments** (Settings → Environments), each restricted to `main`:
   - `customer-production`, `vendor-production`, `master-production`: optional reviewers.
   - `backend-production`: **required reviewers**; secrets `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV` (`SANDBOX` until go-live), `CASHFREE_API_VERSION`.
   - `firebase-production`: **required reviewers**.
4. **Branch protection on `main`:** require a PR review. Path-filtered pipelines don't report on unrelated PRs, so mark checks as required only through a ruleset that allows skipped checks.
5. Optional **repo variables** `VITE_FIREBASE_*` override the public web config baked into the apps.

### Releasing and rollback
- Frontends: merge to `main`; each changed app deploys itself.
- Functions / rules: merge to `main`, then approve the pending deployment in the Actions run.
- Hosting rollback: Firebase console → Hosting → site → Release history → Roll back, or revert the commit.

## 6. Launch operations (added with the launch-hardening release)

### Staff accounts
- Kitchen and manager logins are Firebase Auth email/password accounts with custom claims:
  `{ role: 'master' }` or `{ role: 'vendorAdmin' | 'vendorStaff', vendorId }`.
- The kitchen display binds a kitchen account to its own shop; only `master` can pick a shop.
- New shop: create its account with the claim for the new `vendors/{id}`; a password reset is a
  new password set by the master (Identity Toolkit `accounts:update`).

### Table QR codes
- QR links are `https://<customer-site>/t/<qrToken>`, a 128-bit random token per table; the short
  table code is printed for humans but is never accepted on its own. Tables are master-only in rules.
- Master console → Tables and QR: "Generate secure codes" fills any missing tokens; the refresh
  button on a card replaces that table's token (the old sticker stops working at once).
- After the first generation, print and replace every sticker: old `/t/T14` links no longer work.

### Payments (Cashfree)
- Keys live in Secret Manager: `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`. Mode is the
  `CASHFREE_ENV` param in `functions/.env.reva-nest-foodcourt` (`SANDBOX` or `PRODUCTION`).
- Go live: `firebase functions:secrets:set CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY` with the
  production keys, set `CASHFREE_ENV=PRODUCTION`, redeploy functions, and whitelist the customer
  domain in the Cashfree dashboard. The webhook URL is sent with every order (`cashfreeWebhook`).
- Pay at counter: Settings → turn off online payments; orders go straight to the kitchens.
- The `sweeper` function (every minute) times out unaccepted tickets, reconciles payments whose
  webhook was lost, expires unpaid orders and polls pending refunds; `onTicketFailed` refunds a
  rejected, cancelled or timed-out ticket's share of an online payment.

### Auth sign-up quota (campus Wi-Fi)
- Firebase allows 100 new accounts per IP per hour by default; every diner gets an anonymous
  account, and a campus shares a handful of public IPs. A temporary 5,000/hour per-IP quota was
  scheduled for 7 days from 2026-10-20. Ask Firebase support for a permanent increase (they ask
  for two weeks' notice) or re-schedule the temporary quota before it lapses.

### Finance console
- URL: https://reva-nest-finance.web.app. Login `finance@revafoodcourt.staff` (role `finance`);
  the master account also works. Create more finance logins with the role claim `{"role":"finance"}`.
- **Paying shops:** transfer the money from the bank or UPI as usual, then press **Pay** on the
  shop (Overview) or **Record a payout** (Payouts) and enter the amount and UTR. A wrong entry is
  voided with a reason, never deleted.
- **Commission:** click the rate under a shop's name on Overview. It applies to new orders only.
- Every figure is in IST days. Exports are CSV with rupee amounts (two decimals).
