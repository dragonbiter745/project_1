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

### What runs
| Workflow | Trigger | Does |
|---|---|---|
| `CI` (`.github/workflows/ci.yml`) | every PR, push to `main`, manual | `pnpm install --frozen-lockfile` → typecheck packages → build all apps + functions → customer bundle budget (fails above 150 KB gz, warns above 120) → upload the three `dist/` folders |
| ↳ `preview` job | PRs from this repo | deploys the verified builds to Firebase Hosting preview channels (customer, vendor, master; expire after 7 days) and comments the URLs on the PR |
| ↳ `production` job | push to `main` | deploys the same verified builds to the live sites |
| `Deploy backend` (`.github/workflows/deploy-backend.yml`) | manual only, `main` only | deploys Cloud Functions and/or Firestore rules + indexes; Cashfree keys are written to `functions/.env` from environment secrets for the deploy and deleted after |

Hosting deploys never rebuild: they ship the artifact the `verify` job built and checked.

### One-time setup (repo admin)
1. **Service account.** In Google Cloud (project `reva-nest-foodcourt`) create a service account for CI with roles: Firebase Hosting Admin, Cloud Functions Admin, Service Account User, Firebase Rules Admin, Cloud Datastore Index Admin, Cloud Build Editor, Artifact Registry Writer, API Keys Viewer. Create a JSON key. (`firebase init hosting:github` can create one for Hosting only.)
2. **Repo secret** `FIREBASE_SERVICE_ACCOUNT` = the JSON key. Until it exists, CI still verifies everything and the deploy steps are skipped with a notice.
3. **Environments** (Settings → Environments):
   - `hosting-production`: optional reviewers; restrict to `main`.
   - `backend-production`: **required reviewers**; restrict to `main`; secrets `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV` (`SANDBOX` until go-live), `CASHFREE_API_VERSION`.
4. **Branch protection on `main`:** require the `Typecheck, build, bundle budget` check and a PR review before merging.
5. Optional **repo variables** `VITE_FIREBASE_*` override the public web config baked into the apps.

### Releasing
- Frontend: merge a PR into `main`. Live within a few minutes of CI passing.
- Backend: Actions → Deploy backend → Run workflow → pick `functions`, `firestore-rules` or `all` → approve.
- Rollback (hosting): Firebase console → Hosting → site → Release history → Roll back, or revert the commit on `main`.
