# Qrave production readiness: open problems and how to fix them

Written 11 Nov 2026 against `main` at `25a47dc` and the live project `reva-nest-foodcourt`.
Inputs: the two PDFs (Production-Readiness Audit, 8 Nov; Remediation and Hardening Plan, 10 Nov), a read of the
backend and app code, and read-only checks of the live Firebase / Google Cloud project. Nothing was changed.

## 1. The three things to know first

1. **None of the audit fixes are in the code.** The Remediation Plan says 31 of 36 defects are "fixed on branch
   `fix/audit-remediation` (commits `ce89a64`, `3e94be0`)". That branch and those commits do not exist in the local
   repo, in the Desktop copy, or on GitHub. `main` has no `lib/refunds.ts`, no `settlementReconcile.ts`, no
   `bootstrap-env.sh`, no `restore.sh`, no `docs/disaster-recovery.md`. The plan's "Fixed, tested" labels describe
   work that was done in the auditor's workspace and never delivered. **Treat all 36 defects as open.** If you can get
   that branch from whoever produced the PDFs, it saves several days; otherwise the fixes are rebuilt from section 3.
2. **Production is already taking real money with these defects.** The deployed functions (last deploy 7 Nov) run
   with an `rzp_live_` key. The double-charge and lost-refund paths are live today.
3. **"A few days" is enough for the money-safety fixes, not for everything.** Section 2 is the minimum set. If the
   date cannot move, launch small (two or three shops, one lunch service, a founder watching) and widen after a clean
   week.

How each item below was checked: **Code** = I read the code on `main` and the defect is there. **Live** = read from
the production project. **Audit** = taken from the audit's test evidence; I did not re-run it.

## 2. Must be done before real diners (launch blockers)

| # | Item | Why it blocks | Effort |
|---|---|---|---|
| 1 | C-01 + N-01: double charge on retry, and paid order "disappears" after the UPI app switch | Diners pay twice; the most likely complaint on day one | 1.5 days |
| 2 | C-02, H-02, H-03: refunds depend on one un-retried trigger; last refund can exceed the capture; failed refunds are silent | Diner money lost with nobody told | 1.5 days |
| 3 | H-01: no opening-hours check; sweeper off 22:00–06:00 | Night orders are paid, never cooked, refunded 8 hours later | 0.5 day |
| 4 | M-05, M-06: payment captured after the order expired is cooked hours late or stuck | Real with slow UPI | 0.5 day |
| 5 | N-02: kitchen tablet offline, shop still open | Every order paid, timed out, refunded; repeats all lunch | 1 day |
| 6 | N-03: one failing step stops the whole sweeper | Turns one bug into "no refunds, no payment recovery" | 2 hours |
| 7 | H-04 + N-05: alerts notify nobody; no uptime check; no app error reporting | You hear about outages from customers | 0.5 day |
| 8 | H-08: sign-up quota (100 new accounts per IP per hour by default) | On campus Wi-Fi, new diners cannot open the app at lunch | Console + support ticket, start today |
| 9 | N-06: one Google account owns the project | Lose that account and everything is unreachable | 1 hour |
| 10 | H-06, H-07: staff passwords file; 22 legal placeholders still on the site | Account takeover; legal exposure | Owner |
| 11 | C-03 (minimum): a staging project with test keys | Every fix above is otherwise first tested on live money | 0.5 day |

Everything else in sections 3 and 4 can follow in the first two weeks, in the order of section 6.

## 3. The 36 audit defects: confirmed status and fix

All are **open on `main`**. "Fix" is the change to make; where the plan's design is sound I kept it.

### Critical

| ID | Problem | Checked | Fix |
|---|---|---|---|
| C-01 | A retry can charge twice. The app makes a new `checkoutKey` on every Pay press and treats the first `payment.failed` as final while Razorpay's window stays open | Code: `useCheckout.ts`, `createCheckout.ts` | Server: one payable order per diner + session + cart fingerprint (`checkoutLocks/{hash}`); a second press returns the same order and Razorpay order. App: keep the key until paid, `retry: { enabled: false }`, checkout `timeout` one minute shorter than the server window. Late captures refunded (M-05) |
| C-02 | Refund exists only if `onTicketFailed` runs once, successfully (`retry: false`). Nothing ever re-scans. Finance also counts an unrefunded failed ticket as a sale (`sum('refund.amountPaise')` drops documents without the field) | Code: `triggers/refunds.ts`, `finance.ts` | Write `refund.status = REQUIRED` in the same transaction that rejects, cancels or times out the ticket. One `claimRefund` transaction used by the trigger (now `retry: true`) and the sweeper. Finance counts failed tickets by status |
| C-03 | No staging. `.firebaserc` points `staging` and `prod` at the same project; live keys | Code + Live | Create `reva-nest-foodcourt-staging`, Razorpay test keys, a CI guard that refuses live keys outside prod, deploy to staging first |

### High

| ID | Problem | Checked | Fix |
|---|---|---|---|
| H-01 | Hours never enforced; sweeper schedule is `* 6-21 * * *` | Code + Live (scheduler) | `createCheckout` refuses a shop outside its hours (IST, including past midnight). Sweeper runs all day; an idle sweep is two queries |
| H-02 | `refundShare` rounds each ticket up or down independently, so three refunds can total 1 paisa more than the capture and the last is refused forever | Code: `lib/orders.ts` | Round shares down; the last ticket to fail takes exactly what is left; cap at captured minus already claimed |
| H-03 | A `FAILED` refund is written and nothing else happens. A late webhook can also move `PROCESSED` back to `FAILED` (the update is unconditional) | Code: `razorpayWebhook.ts`, `sweeper.ts` | Open an issue for the manager, log ERROR, add an alert, add a master "retry refund" action with a new idempotency key. Never overwrite `PROCESSED` |
| H-04 | Five alert policies exist with **no notification channel**; no uptime check | Live | Email + SMS channels on every policy; add refund-failed, sweeper-error, bad-signature, error-rate policies and an uptime check |
| H-05 | No second factor for master / finance logins | Audit | TOTP in Firebase Auth, enrol, then enforce with a `REQUIRE_MFA` flag in finance, vendor-access and admin callables |
| H-06 | Staff passwords in a plain-text file that synced to iCloud | Audit (file not found in the working repo; check the Desktop copy and iCloud "Recently Deleted") | Rotate every staff password, move to a password manager, use only emailed invites |
| H-07 | Legal placeholders | Code: 22 `class="tbd"` remain across 5 pages | Fill in, lawyer review, CI check that fails while any `tbd` remains |
| H-08 | Temporary 5,000/hour sign-up quota lapsed | Not visible from the CLI; check Authentication → Settings | Re-schedule the temporary quota now, request a permanent one. See also N-14 |
| H-09 | No settlement, fee or chargeback reconciliation; `payment.dispute.*` events ignored | Code: webhook acknowledges and drops them | Daily settlement job from Razorpay's settlement report; record disputes, raise an issue and an alert; subscribe the webhook to dispute events |

### Medium and low

| ID | Problem | Fix |
|---|---|---|
| M-01 | A limited coupon can be over-redeemed: the hold is per diner, the total is only counted at payment | Reserve against the total inside the checkout transaction; confirm at payment |
| M-02 | Pending refunds reported as refunded | Refunded = `PROCESSED` only; separate "owed / in flight" line |
| M-03 | Coupon cost not reduced when part of a coupon order is refunded | Each refund takes back its share of the coupon |
| M-04 | Payout above balance and duplicate UTR accepted | Reason required above balance; one UTR per shop, enforced in the transaction |
| M-05 | Capture after expiry. Confirmed in code: `materializePaidOrder` does not look at `EXPIRED`, so a late capture turns an expired order `PAID` and sends it to the kitchen | Late capture → full refund, from the webhook, `verifyPayment`, sweeper and nightly job. Keep checking expired orders for 2 hours |
| M-06 | `FLAGGED` (amount mismatch) orders never close | Sweeper refunds in full, closes as `FAILED`, logs ERROR |
| M-07 | Sweeper reads only the oldest 500 unpaid orders (`limit(500)`) | Page through all, with a time budget |
| M-08 | Pending refunds polled one at a time (`for … await`) | Ten at a time |
| M-09 | Rate limits use the first `X-Forwarded-For` entry, which the caller controls | Use the right-most entry (added by Google) |
| M-10 | App Check off | Register reCAPTCHA Enterprise, watch 3 days, enforce |
| M-11 | Messages that are not true ("Nothing was charged" appears in three places in `useCheckout.ts` and once in `createCheckout.ts`, including after a failed attempt that can still succeed) | Rewrite: "If your bank shows a debit, this order updates by itself or the money is refunded automatically". Add a `REFUNDED` status for fully failed orders |
| M-12 | No manual refund or retry; cancels not audited. Confirmed: `adminAction` has one action (QR tokens) | `RETRY_REFUND`, audit entries for reject and cancel. See N-08 |
| L-01 | Same-key race can return no Razorpay order | Second request waits for the first (partly there in `awaitFirstCheckout`; covered by the C-01 lock) |
| L-02 | A retry of an existing order spends the 6-per-10-minutes limit (the limit runs before the existing-order check) | Answer existing orders first |
| L-03 | Unknown Razorpay ids polled forever | Treat 400/404 as "no payment" and expire |
| L-04 | Commission read at payment, not checkout | Snapshot terms on the order at checkout |
| L-05 | Photo URLs from any bucket accepted | Only this project's bucket and the shop's folder |
| L-06 | Every kitchen can read every announcement | Rule: audience contains `ALL` or own shop |
| L-07 | CSP has no `script-src` | Report-only first, enforce after a clean week |
| L-08 | Diner emails never verified | Verification email; member coupon benefits only once verified |
| L-09 | Parent order status written outside a transaction (`syncParentStatus`), and after the ticket transaction, so a crash in between leaves it stale | One transaction; sweeper re-syncs |
| L-10 | One token counter document per shop per day | Measure in the load test; block allocation if p95 > 5 s |
| L-11 | Master can delete a shop document directly | Rule: no delete; archive through the function |
| L-12 | Reconciliation `ok` ignores a totals gap | `ok` also requires totals to match |

## 4. Problems the audit did not list

Found by reading the code and the live project with "what will a real diner, kitchen or bad actor do" in mind.

### N-01 · Critical · A paid order "disappears" when the phone reloads the page
**What happens.** On Android most UPI payments switch to the UPI app and back. Phones with little memory reload the
browser tab on return. The app records the order (`setActiveOrder`, clears the cart, opens tracking) only inside the
Razorpay success handler in `useCheckout.ts`. After a reload that handler never runs. The server still gets the
webhook and the kitchen cooks, but the diner sees a full cart and no order, assumes it failed, and pays again. That is
a second real order and a second charge, and C-01's server lock does not stop it once the first order is `PAID`.
**Fix.** Before opening Razorpay, save `{orderId, checkoutKey, rzpOrderId, cart hash}` in local storage. On every app
start and on `visibilitychange`, if that record exists, read the order: `PAID` → clear the cart, open tracking;
`PENDING_PAYMENT` → show "Confirming your payment" with a server re-check (a small `checkOrder` callable that asks
Razorpay, rate limited); expired or failed → drop the record. Block a new Pay press while an order for the same cart
is unresolved.

### N-02 · High · Kitchen tablet offline, asleep or logged out, shop still "open"
**What happens.** Nothing tells the server a kitchen is watching. If the tablet loses Wi-Fi or power, diners keep
paying; each ticket times out after 3 minutes and is refunded. The diner's money is gone for 5–7 working days, and
Razorpay normally keeps its fee on a refunded payment (confirm on your plan), so the court pays about 2% of every such
order. This repeats for every diner until someone notices.
**Fix.** Kitchen app writes a heartbeat to its shop once a minute while the board is open. `createCheckout` refuses a
shop with no heartbeat for 3 minutes ("not taking orders right now"). The sweeper pauses a shop automatically after
two timed-out tickets in a row and raises an issue for the manager. The catalogue shows the shop as paused.

### N-03 · High · One failing step stops the whole sweeper
**What happens.** `sweeper` runs `timeOutUnaccepted`, then `reconcilePayments`, then `refreshRefunds`, with no
try/catch between them, and the per-ticket transaction in the first step is not caught either. One bad document or a
missing index makes every run throw at the same place: lost webhooks are never recovered and refunds never sent, every
minute, until someone reads the logs. No alert watches sweeper errors.
**Fix.** Each step and each document in its own try/catch, ERROR log with the step name, an alert on it, and a
"last successful sweep" timestamp that the manager console shows red when older than 5 minutes.

### N-04 · High · Tickets can be stuck forever
**What happens.** After Accept, a kitchen cannot back out (`REJECT` is allowed only from `NEW`); only the manager can
cancel. A kitchen that runs out of an ingredient mid-rush has no button, so the diner waits and is never refunded.
There is also no end-of-day close: `PREPARING` and `READY` tickets stay open forever and the order stays `PAID`.
**Fix (needs your decision, it changes the status machine in the PRD).** Let the kitchen press "Can't make this"
from `ACCEPTED`/`PREPARING` with a reason (refund, audited, counted per shop). Sweeper raises an issue for any ticket
in `PREPARING` longer than three times its prep time. A nightly close marks leftover `READY` as collected with an
`autoClosed` flag and lists leftover `PREPARING` for the manager.

### N-05 · High · You cannot see the app breaking
**What happens.** No error boundary and no client error reporting in any app (searched all five). A JavaScript error
after a deploy shows diners a blank page and nothing reaches you. Combined with H-04, a full outage at lunch is
discovered by word of mouth.
**Fix.** A root error boundary with a "Reload" screen, and a tiny reporter (`window.onerror`,
`unhandledrejection`) that posts to a rate-limited function and logs at ERROR, so the existing alerting covers it
(no heavy SDK, keeps the 150 KB budget). Uptime checks on the order site and the catalogue endpoint.

### N-06 · High · One Google account owns everything
**What happens.** Live IAM shows a single owner, a personal Gmail account. A lost phone, a hijacked or locked account,
or a billing problem on that one account takes away the database, the functions and the backups together.
**Fix.** Add a second owner (co-founder) today; hardware key or authenticator plus printed recovery codes for both; a
second admin on the billing account, on Razorpay, on the domain registrar and on GitHub. Longer term: backups copied
to a second project (the plan's "vault").

### N-07 · Medium · Logs are kept 30 days
Live `_Default` log bucket retention is 30 days. Your own runbook says CERT-In needs 180. A dispute or refund question
two months later has no logs. **Fix:** set retention to 180 days (one command; small monthly cost).

### N-08 · Medium · The runbook describes tools that do not exist
`docs/runbook.md` tells the on-call person to use "Force Check Status" in the master console and to read the
reconciliation report there. Neither exists in `apps/master`; reconciliation reports live only in Firestore. It also
names functions that are not in the code (`vendorSlaTimeout`, a 2-minute `reconcilePayments`). During an incident the
document sends people to buttons that are not there.
**Fix.** A "Money health" page in the master console: last sweep, unpaid orders older than 5 minutes with a
"check with Razorpay" button, refunds owed / pending / failed with "retry", last reconciliation result. Then correct
the runbook.

### N-09 · Medium · Nightly reconciliation can fail silently at scale
`reconcileDay` loads every order of the day into memory (default 256 MB) and pages Razorpay 100 at a time. At 10,000+
orders it can run out of memory or time. Alerts fire only when a report has differences, so **no report at all looks
the same as a clean night**. Refund totals are not compared. **Fix:** 1 GiB memory, read only the needed fields,
alert when no report exists by 00:15, add refunds to the comparison.

### N-10 · Medium · Refunds can fail for lack of balance at Razorpay
Refunds are paid from the Razorpay account balance. After the daily settlement leaves, a burst of refunds (a shop
closing mid-lunch) can be refused, which lands in the silent `FAILED` state of H-03. **Fix:** confirm with Razorpay
how refunds are funded on your account, keep a reserve or enable refunds from future settlements, and alert on any
failed refund.

### N-11 · Medium · Live views lose old unfinished tickets on a big day
The kitchen board reads the newest 800 tickets of the day and the manager view the newest 3,000. At the stated
target (10,000+ orders a day) an older unfinished ticket drops out of both screens. **Fix:** query open tickets by
status with no day cap, and finished ones separately with a cap.

### N-12 · Medium · Cold starts on the payment path
Live: every function has zero minimum instances. The first diners of a service wait several seconds on Pay, and a
slow first response is exactly when people press twice. **Fix:** one minimum instance for `createCheckout`,
`verifyPayment`, `razorpayWebhook`, `vendorAction`, `startSession` (a cost decision, a few hundred rupees a month).

### N-13 · Medium · Restoring the database needs a code change
`DATABASE = 'default'` is hard-coded in `functions/src/config.ts`. Switching to a restored database means editing
code, building and deploying under pressure. **Fix:** make it a parameter (`FIRESTORE_DATABASE`,
`VITE_FIRESTORE_DATABASE`) so a restore is a setting and a redeploy.

### N-14 · Medium · Anonymous sign-up is the weak point at the door
Every diner needs a new anonymous account. Besides the quota (H-08), with App Check off a script can mint accounts
freely, and each gets its own 6-checkouts-per-10-minutes allowance and can create Razorpay orders. **Fix:** App Check
(M-10) is the real control; until then lower the per-IP checkout limit from 600 to about 120 a minute and alert on
order-creation rate.

### N-15 · Low · Housekeeping that becomes a problem later
- Old `CASHFREE_APP_ID` / `CASHFREE_SECRET_KEY` secrets are still in Secret Manager. Revoke at Cashfree and delete.
- `functions/.env.reva-nest-foodcourt` is committed to git. It should hold only public values; I could not read it in
  this session, so check that no secret is in it.
- The webhook answers 400 for a payment with no `order_id` or a non-INR currency. Razorpay retries those for 24 hours
  and can disable the webhook. Acknowledge with 200 and log ERROR instead.
- An unknown payment method is stored as `UPI`. Store `UNKNOWN`.
- The payment window is 20 minutes; UPI requests die in about 5. Shorten to 10 to cut late captures.
- Frontends deploy to live on every merge to `main`, including at lunch. Add a deploy freeze 11:30–15:00.

## 5. What people will actually do, and what happens

| The person does this | Today | After the fixes |
|---|---|---|
| Presses Pay twice, or again after a failed UPI attempt | Two orders can both be paid | Same order returned; one charge (C-01) |
| Pays, phone reloads the page coming back from the UPI app | Cart still full, pays again | Order restored on load (N-01) |
| Pays, then closes the browser | Kitchen still gets it (webhook) | Same |
| Approves the UPI request 25 minutes later | Order turns paid and is cooked late, or sits until morning | Refunded in full automatically (M-05) |
| Orders at 23:00 | Paid, never cooked, refunded after 06:00 | Refused: "closed, opens at …" (H-01) |
| Orders from a shop whose tablet is off | Paid, timed out, refunded; next diner the same | Shop shown as paused (N-02) |
| Edits prices or quantities in the browser | Ignored; server recomputes | Same |
| Uses one coupon from many phones at once | Limit can be exceeded | Reserved at checkout (M-01) |
| Sends a fake "payment successful" webhook | Rejected (signature) | Same, plus an alert |
| Spoofs `X-Forwarded-For` to dodge limits | Works | Ignored (M-09) |
| Scripts thousands of anonymous accounts | Limited only loosely | App Check (M-10, N-14) |
| Raises a chargeback with the bank | Nobody is told | Recorded, issue, alert (H-09) |
| Kitchen rejects a ticket | Refund if the trigger runs | Refund owed is recorded with the rejection (C-02) |
| Kitchen accepts, then runs out | No button; diner waits | "Can't make this" → refund (N-04) |
| Kitchen never marks collected | Ticket open forever | Closed nightly (N-04) |
| Staff member leaves with a known password | Still works | Rotated; invites only; MFA (H-05, H-06) |
| Manager records the same payout twice | Accepted | Refused on duplicate UTR (M-04) |
| Clears browser data after paying | Loses the order screen | Look up by phone at the counter (exists in finance search) |

## 6. Order of work (one feature slice per PR, tests with each)

1. **Refund safety**: C-02, H-02, H-03, M-08, retry-refund action, N-03 (sweeper isolation), sweeper all day.
2. **Checkout safety (server)**: C-01 lock, H-01 hours, M-05, M-06, M-07, L-01, L-02, L-03, heartbeat check (N-02).
3. **Customer app**: stable key, no in-window retry, timeout, order recovery on load (N-01), true messages (M-11),
   error boundary and reporter (N-05).
4. **Kitchen app**: heartbeat, auto-pause, open-ticket query (N-11); "can't make this" and nightly close (N-04) once
   you approve the status change.
5. **Operations**: staging project and key guard (C-03), alert channels and new policies, uptime checks, log
   retention, minimum instances, database as a parameter (N-13), off-site backup copy, restore script.
6. **Finance**: M-01 to M-04, L-04, L-12, settlement and disputes (H-09), reconciliation robustness (N-09), Money
   health page (N-08).
7. **Security switches**: MFA, App Check, CSP, M-09, rules L-06 and L-11, L-05, L-08.

Slices 1–3 plus the console items in section 7 are the launch minimum. Each money slice gets tests that fail before
the fix (the audit's test files are in the Desktop copy under `functions/audit/` and can be brought into the repo and
run in CI).

## 7. Things only you can do (no code)

- Get the `fix/audit-remediation` branch from the auditor if it exists anywhere.
- Add a second project owner and second admins on billing, Razorpay, GitHub and the domain (N-06).
- Re-schedule the Auth sign-up quota and request the permanent one (H-08).
- Choose the on-call email and phone number for alerts (H-04).
- Rotate staff passwords; delete the file everywhere (H-06).
- Legal details for the 22 placeholders; lawyer and CA review (H-07).
- Create the staging project and a Razorpay test login (C-03).
- Razorpay dashboard: confirm auto-capture is on, add the dispute events to the webhook, ask how refunds are funded
  and whether fees are returned on refunds (N-02, N-10).
- Decide: "can't make this" after accept (N-04); minimum instances (N-12); shorter payment window (N-15).

## 8. What I did not verify

- I did not re-run the audit's tests; finance arithmetic defects (M-02, M-03, M-04, L-04, L-12) and rules defects
  (L-06, L-11), CSP (L-07) and H-05 are taken from the audit.
- Auth quota and MFA settings are not readable from the CLI.
- No load test was run. The 3× capacity claims in the plan are estimates.
- Razorpay account settings (auto-capture, webhook events, refund funding, fee on refunds) need the dashboard.
- I did not read `firestore.rules` line by line in this pass, or the finance, coupon-admin and messaging callables in
  full. A focused rules and admin-callable review is worth doing before slice 7.

## 9. Status, 12 Nov 2026

Code is on local branch `fix/customer-checkout-recovery` (stacked: `fix/refund-safety` → `fix/checkout-safety` → this),
5 commits on top of `main` 25a47dc. Not pushed. Backend and rules suite: **231 tests pass** (23 files, plus 18 in
`launch.test.ts`); all five sites build; diner bundle 141 KB gz (budget 150).

### Fixed in code (deploys with the next functions, rules, indexes and hosting deploy)

C-01, C-02, H-01, H-02, H-03, H-09, M-01 to M-09, M-11, M-12, L-01 to L-06, L-08, L-09, L-11, L-12, and
N-01 to N-05, N-08, N-09, N-11, N-13, N-14, N-15 (webhook, payment method, env file checked: public values only).
Switches in code, off until their console step: H-05 (`REQUIRE_MFA`), M-10 (`APP_CHECK_ENFORCE`), L-07 (CSP is
report-only; enforce after a clean week). C-03: CI key guard and the `staging` alias no longer points at production.

Decisions taken (call out if you disagree):
- Kitchens may cancel a ticket they accepted ("Can't make"), refunded and audited; a ready ticket stays manager-only.
- Nightly close at 03:15 IST marks yesterday's READY tickets collected (`autoClosed: true`) and flags ones still cooking.
- A shop with no kitchen heartbeat for 4 minutes is refused at checkout; shops that never ran the screen are not checked.
- Minimum instances left at 0 (cost rule). The cart lock now makes a double press harmless, so a cold start only costs speed.
- Payment window kept at 20 minutes; the app's Razorpay window closes a minute earlier.

### Applied to the live project today

- Log retention 30 → **180 days** (N-07).
- TTL policy on `checkoutLocks.expireAt`.
- Email alert channel attached to all 5 existing policies; **10 new alerts** (refund failed, refunds not sending,
  chargeback, sweeper errors, app crashes, shop auto-paused, reconciliation missing, late refunds, function error rate,
  bad webhook signatures); **uptime checks** on order.getqrave.in and /api/status with alerts (H-04).
- Auth sign-up quota re-applied: 5,000/hour per IP until 19 Nov (H-08); `renewSignupQuota` keeps it renewed once deployed.
- Export bucket `reva-nest-foodcourt-db-exports` (asia-south1, 35-day retention) and job `qrave-nightly-db-export`
  (02:15 IST), **paused**: it needs one IAM grant (below).

### Still open

| Item | Why it is not done | What it takes |
|---|---|---|
| Deploy everything above | The deploy command was blocked by this machine's permission settings | Section 10 commands, after 15:00 or before 11:30 IST |
| Nightly export job | Granting the export role was blocked by permission settings | `gcloud projects add-iam-policy-binding reva-nest-foodcourt --member=serviceAccount:298874069682-compute@developer.gserviceaccount.com --role=roles/datastore.importExportAdmin` then `gcloud scheduler jobs resume qrave-nightly-db-export --location=asia-south1 --project reva-nest-foodcourt` |
| N-06 second owner | Needs another person's Google account | Add a co-founder as Owner; second admins on billing, Razorpay, GitHub, domain |
| H-05 MFA | Each manager must enrol their own authenticator | Enable TOTP in Firebase Auth, enrol, then `REQUIRE_MFA=true` |
| M-10 App Check | Needs a reCAPTCHA Enterprise key registered in the console | Register, add the site key to the apps, watch 3 days, `APP_CHECK_ENFORCE=true` |
| H-06 staff passwords file | Owner action | Rotate, delete the file and iCloud copy |
| H-07 legal placeholders (22) | Needs the company's legal details | Founders + lawyer |
| H-08 permanent quota | Needs a Firebase support request | Until then the weekly renewal covers it |
| C-03 staging project | Needs a billing-linked project and a Razorpay test login | Create `reva-nest-foodcourt-staging`; the alias already points there |
| Razorpay dashboard | Dashboard only | Confirm auto-capture; add `payment.dispute.*` to the webhook events; ask how refunds are funded |
| Load test at 3× | Needs staging | Section 7 of the remediation plan |

## 10. Deploy order (production, outside 11:30–15:00 IST)

```
cd ~/Developer/qrave
firebase deploy --only firestore:indexes --project reva-nest-foodcourt   # wait until every index shows Enabled
firebase deploy --only firestore:rules --project reva-nest-foodcourt
firebase deploy --only functions --project reva-nest-foodcourt
firebase deploy --only hosting --project reva-nest-foodcourt
```
Then push the branch and merge to `main`, or the next CI deploy from `main` will put the old code back.
