# Cost control

Firebase bills **operations**, not users. Every document read, write and function call is billed no matter who or
what caused it, so any feature that "refreshes every minute" turns each open tab into a meter. That is how a
product with about 100 real users at peak ends up sending millions of requests. This page records what was
found in this project, what changed, what the bill will honestly be, and the rules that keep it that way.

Figures below are counted from the code (see "How the numbers were made"). Prices change: check the current
Firebase pricing page before relying on the rupee amounts.

## 1. What was found, and what was done

| # | Finding (before) | Cost | Fix |
|---|---|---|---|
| 1 | Every visible customer tab re-downloaded the whole catalogue every 60 s straight from the database | ~16 reads and ~100 KB per refresh. 3,000 users for 30 min = **1.44 M reads and ~9 GB** | The catalogue is a precomputed copy served through the Hosting CDN (`/api/status`, `/api/catalog?v=`). Database reads now depend on how often the catalogue **changes**, not on how many phones are open (~4 reads a minute) |
| 2 | `vendors`, `menus`, `availability`, `config`, `venues` readable by anyone on the internet | Any script could loop on them and the reads are billed to the project | Rules now allow staff only (their own shop, or the manager). Diners use the CDN |
| 3 | Shop-admin Home called the report function every 60 s for as long as the tab stayed open | 840 backend calls a day per tab, each running several queries | Once on open, then every 5 minutes **only while the tab is in front** |
| 4 | The sweeper ran every minute, all day and night, and read every shop each time | ~11,500 reads a day with zero customers | One query when nothing is waiting; shops are read only when a ticket is overdue; runs 06:00 to 21:59 IST only (~2,900 reads a day idle) |
| 5 | Every unpaid order was checked with Cashfree once a minute for 20 minutes | ~18 calls per abandoned order | Checked at 2, 3, 5, 8, 12, 16, 21 and 26 minutes (the payment window is 20), then every sweep |
| 6 | The shared rate limiter costs a read **and** a write per call and ran on every kitchen action, session start and staff report | ~7 extra operations per order | Trusted staff routes and session start use the free in-memory limiter. The payment route keeps the shared one |
| 7 | After every kitchen step the order's overall status was re-queried and re-written | A query, a read and a write per step | Re-checked only after Collected, Reject and Cancel, the only steps that can change it, and written only if it changed |
| 8 | Staff screens kept no local copy and kept streaming from background tabs | Re-download on every reload; overnight meters | Browser cache for staff apps; master and shop admin pause their listeners after 2 minutes in the background |
| 9 | Dish photos downloaded at full size in the menu list; three functions kept servers always on | Egress and idle compute | 240 px thumbnails; no always-on instances |
| 10 | Auto-refresh timers elsewhere | n/a | Audited: the remaining timers only redraw the clock and make no network calls |

## 2. How Firebase counts (the parts that matter)

- **Reads:** one per document a query returns, **and one for every change delivered to every listening
  device**. A ticket that changes four times, watched by 2 kitchen tablets, 2 manager tabs and the diner, is
  about 20 reads. Aggregation queries (count, sum) cost one read per 1,000 index entries, so the finance
  reports are cheap.
- **Writes:** one per document written, including merges. A transaction reads and writes.
- **Free every day:** 50,000 reads, 20,000 writes, 20,000 deletes, 1 GiB stored.
- **Functions:** 2 million invocations a month free. Always-on instances are billed even when idle.
- **Hosting:** 10 GB stored and about 10 GB a month of downloads (~360 MB a day).
- **Storage:** the free allowance applies only to a default bucket in `us-central1`, `us-east1` or
  `us-west1`. A bucket in India is billed from the first byte (see section 6).

## 3. What a paid order costs, and what that means for the bill

Counted from the code (1.3 shop tickets per order on average):

| Step | Reads | Writes |
|---|---|---|
| Scan and open a session | 4 | 3 |
| Checkout (price and stock re-checked on the server) | 9 | 3 |
| Payment confirmed (webhook creates the tickets) | 5 | 5 |
| Kitchen steps (accept, ready, collected), order status, push | 11 | 5 |
| Live updates to the diner's phone | 11 | 0 |
| Live updates to kitchen tablets (2 per shop) | 10 | 0 |
| Live updates to manager tabs (2 open) | 10 | 0 |
| **Total** | **~60** | **~16** |

Background cost with no orders: about 13,000 reads a day (sweeper, catalogue refresh, stock changes, staff
reports) and about 500 writes.

| Orders per day | Reads/day | Writes/day | Approx. bill per month |
|---|---|---|---|
| 500 | 43 K | 8 K | **₹0** |
| 750 | 58 K | 12 K | ~₹9 |
| 1,000 | 73 K | 16 K | ~₹26 |
| 1,500 | 103 K | 24 K | ~₹73 |
| 2,000 | 133 K | 32 K | ~₹132 |
| 2,500 | 163 K | 40 K | ~₹192 |
| 3,000 | 193 K | 48 K | ~₹252 |

Assumes ₹3.75 per 100 K reads and ₹11 per 100 K writes over the free allowance. With one kitchen tablet per
shop and one manager tab the free level rises from about 620 to about 750 orders a day.

**Read this honestly:** the bill is **zero up to roughly 600 to 750 orders a day** and grows by about ₹85 a
month for every extra 1,000 orders a day. "3,000 users at peak" is not "3,000 orders": a crowd browsing
the menu now costs almost nothing, because the catalogue no longer touches the database per person. Cost follows
**orders**, not visitors. A true ₹0 at 3,000 orders a day needs the live ticket stream moved off Firestore
(Realtime Database bills by data, not by operation). That is a larger change, and the hard cap in section 5
is what guarantees the number cannot run past what you decide.

## 4. Rules that keep it cheap (check these on every new feature)

1. **No polling.** Never call a function or read a collection on a timer. Use a listener, or the CDN catalogue.
2. **No listener on a whole collection.** Always filter by shop, session or user, and keep a `limit`.
3. **Pause what nobody is watching.** Background tabs of manager and admin screens stop listening. Only the
   kitchen screen must stay live all service.
4. **Reads that many people need go through the CDN**, never straight to Firestore from the browser.
5. **Do not write what did not change.** Compare first; skip the write (and everyone's re-read).
6. **Rate limits for staff routes are in memory.** The shared limiter (a read and a write per call) is for money
   and for abuse-prone public routes only.
7. **Scheduled jobs do nothing when idle**, and run only while the court can be ordering.
8. **A background job that calls a paid API (Cashfree) backs off** instead of calling every minute.
9. **Every new public endpoint gets a CDN cache and an instance cap.**
10. **Test it.** Anything touching money, rules or the sweeper needs a test (`functions/test`).

## 5. The hard cap: billing guard (needs one decision from you)

Everything above lowers the bill. Only a **cap** guarantees a limit: Google can stop all charges by unlinking
the project from its billing account when the month's spend reaches a budget. `billingGuard`
(`functions/src/billing/killSwitch.ts`) does this when a budget alert arrives. It is deployed **switched off**.

Consequence to accept: when it fires, the project drops to the free plan, Cloud Functions stop (checkout and
payments with them), and the apps show errors until you link billing again. Budget alerts lag by a few hours, so
the real stop point can overshoot the budget slightly.

Set it up once, after choosing the budget (suggested: **₹100 a month**, which is above the free-tier level of
about 700 orders a day and far below anything dangerous):

1. Console → Billing → **Budgets and alerts** → create a budget on the project `reva-nest-foodcourt`: amount
   in rupees, alerts at 50%, 90% and 100%, **connect a Pub/Sub topic named `billing-budget`** (project
   `reva-nest-foodcourt`) and add your email.
2. Give the guard permission to unlink billing: Billing → **Account management** → add the principal
   `298874069682-compute@developer.gserviceaccount.com` (the functions' service account) with the role
   **Project Billing Manager** (or Billing Account Administrator).
3. Deploy with the guard on: set `KILL_SWITCH_ENABLED=true` in `functions/.env.reva-nest-foodcourt`, then
   `firebase deploy --only functions:billingGuard --project reva-nest-foodcourt`.
4. Test it with a tiny throw-away budget in a spare billing setup before relying on it. It logs
   `Budget reached` either way.
5. **To recover after it fires:** Billing → My projects → link `reva-nest-foodcourt` to the billing account, then
   set `KILL_SWITCH_ENABLED=false` (or raise the budget) so it does not fire again at once.

## 6. The photo bucket (done)

The default Storage bucket was created in **`us-central1`**, inside the free allowance (5 GB stored, 1 GB a day of
downloads), under the name the apps already use (`reva-nest-foodcourt.firebasestorage.app`). Its rules accept only JPEG,
PNG or WebP under 1 MB, only from the shop's own admin or the manager. Photos are uploaded as a full copy and a 240 px
thumbnail (about 10 KB) that menu lists load; the browser caches them for a year. When a dish photo or logo is replaced
or removed, the old files are deleted after the server confirms the change.

Checked in production with a throw-away shop-admin account: own-folder upload and delete work; another shop's folder,
non-images, files over 1 MB, other paths and signed-out visitors are all refused with 403.

## 7. App Check (deferred by choice)

App Check proves a request comes from the real Qrave website. It needs a reCAPTCHA v3 site key from the Firebase
console, so it was **skipped for now**. Without it, a script with a free anonymous account can still call
`startSession` and `createCheckout`, so these limits stand in for it:

- `createCheckout`: 6 attempts per account per 10 minutes, 600 a minute per IP.
- Pay-at-counter orders: 3 per table session and 30 per table per 15 minutes.
- Every function has an instance cap, and `billingGuard` is the final limit once a budget is set (section 5).
- In an attack, the manager's **maintenance** switch (Settings) stops ordering at once.

To add it later: register each web app in Console → App Check with a reCAPTCHA v3 key, give me the key, watch the
metrics for a day, then enforce it for Functions and Firestore. Enforcing before the apps send tokens blocks every customer.

## 8. Weekly check (two minutes)

Firebase Console → **Usage and billing**: Firestore reads and writes against 50 K and 20 K a day, Functions
invocations, Hosting downloads. A read count that climbs while orders do not is a polling loop; find the new
timer or listener.

## 9. Rollout order (do not reorder)

1. `firebase deploy --only functions --project reva-nest-foodcourt` (adds `catalog`, four catalogue triggers,
   the cheaper sweeper, lighter rate limits, `billingGuard` switched off).
2. `firebase deploy --only hosting --project reva-nest-foodcourt` (the apps and the `/api` rewrites).
3. Open `https://order.getqrave.in/api/status`: it must return JSON. Open the order page and check in the
   browser's Network tab that the menu comes from `/api/...`, with no `firestore.googleapis.com` calls.
4. **Only then** `firebase deploy --only firestore --project reva-nest-foodcourt` (the short form `firestore:rules`
   matches nothing with this project's named database), which closes the public reads. Deploying the rules first would break the menu for everyone.

## How the numbers were made

Counted by hand from `startSession`, `createCheckout`, `materializePaidOrder`, `vendorAction`, `notifyTicket`
and the live listeners in `packages/firebase-client/src/live.ts`. Change a shop count or device count and the
totals move; the per-step table above is the thing to update.
