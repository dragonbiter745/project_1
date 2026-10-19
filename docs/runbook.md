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
