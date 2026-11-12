# FoodCourt — Operational Runbook

## 1. Webhook Failures & Payment Triage
- **Symptom:** Diner paid on UPI / Card, but screen stays on "Confirming payment..."
- **Root Causes:**
  1. Razorpay webhook dropped or delayed by PG.
  2. Webhook signature mismatch (webhook secret rotated or not matching the dashboard).
- **Resolution Steps:**
  1. The `sweeper` (every minute, around the clock) asks Razorpay about unpaid orders at 2, 3, 5, 8, 12, 16, 21 and 26 minutes and settles any captured payment (auto-capture must be on in the dashboard: an `authorized` payment is never settled). A payment that lands after the order expired is refunded in full, never cooked.
  2. Master console → **Money health** → Unpaid orders → **Check with Razorpay** on the diner's order: settles it now if paid.
  3. The diner's app re-checks by itself when they return from the UPI app, and never lets them pay twice for the same cart.

## 2. Vendor SLA Timeout & Auto-Refund
- **SLA Rule:** Vendor has 3 minutes (180 seconds, configurable in `vendors/{vendorId}.acceptSlaSec`) to accept an incoming order.
- **Auto-action:**
  - If unaccepted after 180s, the `sweeper` marks the ticket `TIMED_OUT` and, in the same write, records the refund owed (`refund.status = REQUIRED`).
  - The refund is sent by the `onTicketFailed` trigger within seconds, or by the sweeper within a minute if the trigger is lost (`receipt = rf_{subOrderId}`, same value as idempotency key). A failed refund appears on **Money health** with a Retry button and raises an alert.
  - Two timeouts in a row pause the shop automatically (nobody is watching that screen) and raise an issue; the kitchen resumes with one tap.
  - A kitchen that stops sending its heartbeat (screen closed, tablet asleep, Wi-Fi down) for 4 minutes is refused at checkout.
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
| **Backend · Cloud Functions** (`backend-functions.yml`) | `functions/**` | typecheck + build | deploy after approval on `backend-production`; Razorpay keys written to `functions/.env` from environment secrets, deleted after |
| **Firebase · Rules & indexes** (`firebase-rules.yml`) | `firebase/**`, `firebase.json` | compile Firestore + Storage rules in the emulators (`scripts/ci/validate-rules.mjs`), validate indexes JSON | deploy after approval on `firebase-production` |

The three frontends share `_frontend.yml`, and every pipeline uses `.github/actions/setup` (Node 22, pnpm from `packageManager`, cached store, frozen install). Frontend deploys ship the exact artifact the verify job built. Every pipeline can also be run by hand (Actions → pipeline → Run workflow).

### One-time setup (repo admin)
1. **Service account.** In Google Cloud (project `reva-nest-foodcourt`) create a CI service account with: Firebase Hosting Admin, Cloud Functions Admin, Service Account User, Firebase Rules Admin, Cloud Datastore Index Admin, Cloud Build Editor, Artifact Registry Writer, API Keys Viewer. Create a JSON key.
2. **Repo secret** `FIREBASE_SERVICE_ACCOUNT` = that JSON key. Until it exists, verify jobs still run and frontend deploys are skipped with a notice.
3. **Environments** (Settings → Environments), each restricted to `main`:
   - `customer-production`, `vendor-production`, `master-production`: optional reviewers.
   - `backend-production`: **required reviewers**; secrets `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`; `RAZORPAY_KEY_ID` (`rzp_test_` until go-live) is a param in `functions/.env.<project>`.
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
- **Day to day, use Operations console > Vendors.** It adds and removes shops, emails a vendor a link to
  choose their own password (first login or a reset), switches a login off, or removes it. Nobody types or
  sees a vendor's password. The link is single use and lasts 72 hours; a new link replaces the old one.
  Logins created before this feature have stand-in `@foodcourt.local` addresses: invite the shop's real
  email, check it works, then remove the stand-in.
- One-time setup for the emails: create a Resend account, verify the sender domain (getqrave.in), then
  `firebase functions:secrets:set RESEND_API_KEY --project reva-nest-foodcourt`. `MAIL_FROM`, `VENDOR_URL`
  and `SHOP_ADMIN_URL` live in `functions/.env.reva-nest-foodcourt`. Until the secret exists the Vendors page
  shows "Email is not set up yet" instead of sending.
- Removing a shop that has taken orders switches it off and hides it (past orders, payouts and reports must
  still add up). A shop with no orders is deleted.
- Manual fallback (console unavailable): create the account with the claim for the `vendors/{id}`; a password
  reset is a new password set by the master (Identity Toolkit `accounts:update`).

### Adding a shop (checklist, manual fallback)
The Vendors page creates the shop (a new shop starts paused with an empty menu) and its logins; the steps
below are for when it is not available.
1. Write `docs/menus/<shop>.json` and run the menu test (`npm test` in `functions`).
2. Create `vendors/<id>`, `availability/<id>` and `menus/<id>` with create-only writes. Do not re-run `seed.ts` on production: it resets the global config and regenerates every table QR.
3. Create two logins, the kitchen one (`vendorAdmin`) and the shop admin one (`vendorFinance`), each with its `vendorId` claim.
4. Set the claims with Identity Toolkit `accounts:update` and read them back. `accounts:create` can accept `customAttributes` without applying them, and the login then signs in but is refused by the kitchen and admin apps.
5. Set the platform charge (₹1 per order is `feePct: 0`, `perOrderFeePaise: 100`) and confirm hours and prep time with the shop.

### Table QR codes
- QR links are `https://<customer-site>/t/<qrToken>`, a 128-bit random token per table; the short
  table code is printed for humans but is never accepted on its own. Tables are master-only in rules.
- Master console → Tables and QR: "Generate secure codes" fills any missing tokens; the refresh
  button on a card replaces that table's token (the old sticker stops working at once).
- After the first generation, print and replace every sticker: old `/t/T14` links no longer work.

### Payments (Razorpay)
- Secrets live in Secret Manager: `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`. The public key id is the
  `RAZORPAY_KEY_ID` param in `functions/.env.reva-nest-foodcourt`; its prefix is the mode (`rzp_test_` test,
  `rzp_live_` live). The customer app has no key variable: `createCheckout` returns the key id with each order.
- One-time setup in the Razorpay dashboard: enable auto-capture, then Settings → Webhooks → add
  `https://asia-south1-<project>.cloudfunctions.net/razorpayWebhook` for `payment.captured`, `order.paid`,
  `payment.failed`, `refund.processed`, `refund.failed`, with a strong secret; store that secret with
  `firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET`, and the API secret with `RAZORPAY_KEY_SECRET`.
- Go live: set both secrets to the live values, set `RAZORPAY_KEY_ID=rzp_live_...`, redeploy functions, and
  create the webhook again in live mode (webhooks are per mode).
- Local e2e uses a built-in Razorpay stand-in (`lib/razorpay.ts`) that only runs when `FUNCTIONS_EMULATOR` is
  set, the key id is exactly `rzp_test_placeholder` and it is not a live key. A deployed function can never take
  that path (guarded by `test/razorpay.test.ts`). `functions/.env.local` holds those placeholders; to try real
  test-mode payments locally, put your `rzp_test_` key and secret there instead (the stand-in then switches off).
- Rotate leaked keys in the dashboard, then update the secrets; the old ones stop working immediately.
- Pay at counter: Settings → turn off online payments; orders go straight to the kitchens.
- The `sweeper` function (every minute) times out unaccepted tickets, reconciles payments whose
  webhook was lost, expires unpaid orders and polls pending refunds; `onTicketFailed` refunds a
  rejected, cancelled or timed-out ticket's share of an online payment.

### Auth sign-up quota (campus Wi-Fi)
- Firebase allows 100 new accounts per IP per hour by default; every diner gets an anonymous
  account, and a campus shares a handful of public IPs. A temporary 5,000/hour per-IP quota was
  scheduled for 7 days from 2026-10-20. Ask Firebase support for a permanent increase (they ask
  for two weeks' notice) or re-schedule the temporary quota before it lapses.

### Finance
- **Court (our income):** master console → **Finance**. Commission income, what each shop is
  owed, the payment ledger, payouts and commission rates. Master login only.
- **Each shop:** https://reva-nest-finance.web.app with that shop's finance login, e.g.
  `roll-me-finance@revafoodcourt.staff` (role `vendorFinance`, `vendorId` of the shop). It is a
  separate login from the kitchen one and shows only that shop. New shop → create a login with
  claims `{"role":"vendorFinance","vendorId":"<vendor id>"}`.
- **Paying shops:** transfer from the bank or UPI as usual, then press **Pay** on the shop
  (Finance → Income and shops) or **Record a payout** (Finance → Payouts) with the amount and
  UTR. The shop sees it under "Payments from the court". A wrong entry is voided with a reason.
- **Commission:** click the rate under a shop's name. It applies to new orders only.
- Periods: Today, Yesterday, Last 7 days, Last 30 days or any from–to dates. Every headline figure
  shows its change against the previous period of the same length.
- Figures are in IST days. Exports are CSV with rupee amounts (two decimals).

### Founder books (no spreadsheet)
- Master console → Finance → **Revenue & expenses**: press **Add expense** whenever money is
  spent (amount, what for, category, who paid). Revenue fills in by itself from orders.
- Finance → **Founders**: **Add investment** when a founder puts money in, **Record withdrawal**
  when one takes money out, **Edit shares** for the profit split. **Print or save PDF** gives the
  partner share report for the chosen period.
- Mistakes are voided with a reason, never deleted. Export any table as CSV if you need it.

## 7. Personal data breach and cyber incident response (DPDP Act 2023, CERT-In Directions 2022)

A breach is any unauthorised access, loss, change or disclosure of personal data (names, emails, phone numbers,
orders), including a leaked key, an open database rule, or a lost founder laptop with console access.

1. **Contain (first hour).** Revoke or rotate the leaked credential (Secret Manager, Firebase service accounts,
   Razorpay keys), redeploy tightened rules, switch on maintenance mode if orders are at risk. Do not delete logs.
2. **CERT-In within 6 hours** of noticing a reportable cyber incident (incident@cert-in.org.in, form on
   cert-in.org.in). Send what you know; update later.
3. **Data Protection Board without delay**, and a detailed report **within 72 hours**: what happened, when, data
   and people affected, likely impact, what we did, how we will stop it happening again, and contact details.
4. **Tell every affected diner without delay**, in plain words: what happened, what data, likely consequences,
   what we did, what they should do (e.g. watch for phishing), and the Grievance Officer's contact. Use email
   where we have it, and the in-app inbox.
5. **Record** a timeline in `auditLogs` and a written post-mortem in `docs/` within a week.

Keep: Cloud Logging and audit logs for at least **180 days** (CERT-In) and ideally 1 year; check the log bucket
retention in Google Cloud Console → Logging → Log storage. Staff consoles must use strong passwords and Google
2-step verification for every founder account with Firebase or Razorpay access.

## 8. Disaster recovery (data loss, bad deploy, gateway outage)

Targets: **RPO** (most data we can lose) ≈ 1 minute with point-in-time recovery; **RTO** (time to be taking orders again) under 60 minutes for a bad deploy, under 2 hours for a database restore. Payments are never lost because Razorpay is the second copy of every rupee: `paymentEvents` (our ledger) and the nightly `reconciliationReports` prove the two sides agree.

### Current state (applied 2026-11-07, read back from production)
Database `default`: point-in-time recovery enabled (7 days), delete protection enabled, backup schedules daily (kept 7 days) and weekly Sunday (kept 14 weeks). Five Cloud Monitoring alert policies are active: webhook failures, amount mismatch, reconciliation differences, Razorpay order creation failures, checkout errors (they open incidents in the Monitoring console; add a notification channel in Monitoring when one is wanted). `scripts/ops/harden-infra.sh` re-applies all of this and is safe to re-run (`SKIP_DB=1` for the alerts alone).

### Restore drill (done 2026-11-07)
Cloned `default` at a point 10 minutes in the past into a scratch database with `gcloud firestore databases clone`. It completed in **15 min 34 s** and every collection matched production exactly (orders 41, subOrders 8, vendors 5, menus 5, availability 5, tables 155, coupons 5, config 1). The clone inherited delete protection, which had to be switched off on the scratch copy before it could be deleted. Repeat the drill every quarter and after any large data growth; the time scales with data size.

### Real-database load test
`LOADTEST_DATABASE=<throwaway> GCLOUD_PROJECT=reva-nest-foodcourt RUSH_DINERS=300 RUSH_RATE=0 pnpm --dir functions load:real` runs the lunch-rush suite against a real Firestore database (never `default`; the setup refuses it). Create the database and its indexes first (see the commands in the 2026-11-07 history of this section), and delete it afterwards.

### Scenarios
| What happened | First 5 minutes | Recovery |
|---|---|---|
| Our functions are down or erroring | Check Firebase status and `firebase functions:log`. Set Settings > maintenance on (diners see a pause message). | Roll back: redeploy the last good commit (`git revert` then the backend pipeline). Razorpay keeps retrying webhooks for 24 h; the sweeper and the nightly reconciliation settle anything missed. |
| Razorpay down | Checkout already answers "Payments are not responding. Nothing was charged." Turn `paymentsEnabled` off in Settings to switch the court to pay-at-counter. | Turn it back on. Orders created but not paid expire by themselves; captured ones settle on the next sweep. |
| Webhook was disabled by Razorpay (24 h of failures) | Razorpay emails the owner. Fix the cause, re-enable the webhook in the dashboard. | In the dashboard, replay the missed events (same `x-razorpay-event-id`, so replays are safe). Also run the reconciliation (below). |
| Bad data written (a bug, a mistaken edit) | Note the time. Stop the cause (roll back or maintenance mode). | Read the data as it was: `gcloud firestore databases clone` (below) to a new database from a minute before, compare, and copy the documents back with a script. Never restore over production blind. |
| Database deleted or corrupted | Delete protection should have blocked deletion. Switch on maintenance. | Restore the newest backup into a new database (below), point the functions at it (`DATABASE` in `functions/src/config.ts`), redeploy, then run reconciliation to re-settle anything paid after the backup. |
| Someone abuses the app (fake orders, coupon farming) | Per-user and per-IP limits already apply. Disable the abusing account in Firebase Auth; pause the coupon in the Coupons page. | Orders from the abuser are refunded through the normal refund path; see `auditLogs`. |

### Restore commands
```
# Point in time (any minute in the last 7 days): clone into a NEW database, never over production
gcloud firestore databases clone --source-database=projects/reva-nest-foodcourt/databases/default \
  --destination-database=restore-check --snapshot-time=2026-11-08T10:15:00Z --project reva-nest-foodcourt
# the clone keeps delete protection: turn it off on the scratch copy only before deleting it
gcloud firestore databases update --database=restore-check --no-delete-protection
# From a backup
gcloud firestore backups list --project reva-nest-foodcourt
gcloud firestore databases restore --source-backup=<backup-resource-name> --destination-database=restore-check --project reva-nest-foodcourt
```
Verify in the console that `orders`, `subOrders` and `paymentEvents` look right, then delete `restore-check`. 

### Money check, any time
In the master console the nightly `reconciliationReports/{date}` document says `ok: true` when Razorpay and our books agree for that IST day. If it says `ok: false` the `samples` list names each order and payment. To run one by hand, call `reconcileDay(dateKey)` from a shell with admin credentials, or wait for 23:30 / 06:30 IST. A payment Razorpay took that we never settled is settled automatically; an amount difference or money we recorded but Razorpay never received is never auto-fixed and needs a human.

### Things that must NOT be turned on
`KILL_SWITCH_ENABLED` unlinks billing when a budget is hit. For a business taking real payments that would switch the whole service off in the middle of lunch. Keep it `false`, keep budget **alerts**, and decide manually.

