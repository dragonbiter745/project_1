# Fifty worst cases

What the system does when a diner, a script, a kitchen or the network does the worst thing. Each case says what
happens, what protects it **in the code or rules today**, and one of:

- ✅ **Safe**: already handled, and where it is tested if it is.
- 🛠 **Fixed**: changed in the cost and security pass (in the repo; needs the rollout in `docs/cost-control.md`).
- ⚠ **Open**: needs a decision, a console step, or something to watch. These are the real to-do list.

"Tested" means a test in `functions/test` fails if the protection is removed.

## A. Cost and abuse of the wallet

| # | Scenario | What happens / protection | Status |
|---|---|---|---|
| 1 | 3,000 phones sit on the menu, each refreshing the catalogue every minute | Was ~16 reads and ~100 KB per refresh per phone (1.4 M reads in one rush). Now the CDN answers; the database sees ~4 reads a minute whatever the crowd (`functions/src/catalog.ts`, tested) | 🛠 |
| 2 | Someone scripts the public Firestore API key to read vendors, menus, stock and config in a loop | Those reads were public and billed to you. Rules now allow staff only, the manager sees everything, and the cached copy is server-only (`firestore.rules`, tested) | 🛠 |
| 3 | An attacker adds random `?x=...` to `/api/status` so the CDN never has it cached | Every URL reaches the function, but each warm instance reads the database at most once per 10 s (status) or 30 s (catalogue) and only 3 instances may run. Invocations are still billable but cheap; the budget guard is the backstop | ⚠ |
| 4 | A script makes thousands of anonymous accounts and floods `startSession` (~3 writes each) | A per-IP limit (900 a minute) and a per-account limit exist, but with App Check off nothing proves the caller is your app, and a campus shares one IP so the limit must stay loose. App Check is deferred by choice; the allowances below are the compensating controls. Enable it later (cost-control §7) | ⚠ |
| 5 | A script floods `createCheckout`, creating unpaid orders and Cashfree orders | 6 per account per 10 minutes (shared limiter, so it holds across servers; tested), 600 a minute per IP, 100 instances maximum. Each unpaid order is now checked with Cashfree ~8 times, not ~20. App Check is deferred by choice; the guard caps the damage | ⚠ |
| 6 | A shop admin leaves the admin tab open from 7 am to 9 pm | Was 840 backend calls a day. Now one call every 5 minutes, only while the tab is visible (`apps/admin/src/home/Home.tsx`) | 🛠 |
| 7 | The manager leaves the console open overnight on a laptop | Listeners stop 2 minutes after the tab goes to the background and restart on return; the browser keeps a local copy so a return fetches only changes (`whenVisible`, `enablePersistentCache`) | 🛠 |
| 8 | A kitchen tablet loses Wi-Fi for 40 minutes and reconnects | Firestore re-reads the shop's tickets for the day (capped at 800). With the local cache, short drops fetch only changes. Cost is bounded by the shop's tickets that day, not by time | ✅ |
| 9 | Nobody uses the app at night | The sweeper used to read every shop every minute, around the clock (~11,500 reads a day). It now runs 06:00 to 21:59 IST and does one query when nothing is waiting (tested in `cost.test.ts`) | 🛠 |
| 10 | Thousands of people start a payment and never finish | The reconciler used to ask Cashfree about each every minute for 20 minutes. It now checks at 2, 3, 5, 8, 12, 16, 21 and 26 minutes, and still expires the order (tested) | 🛠 |
| 11 | A trigger writes a document that fires the same trigger, forever | Checked: catalogue triggers write only to `publicCatalog`, which nothing watches; the ticket-notify trigger returns when the status did not change; triggers do not retry | ✅ |
| 12 | Cashfree's webhook keeps failing and Cashfree retries | Handling is idempotent (an already-paid order returns "already"), so retries cost a read and change nothing (tested) | ✅ |
| 13 | A charge appears from something that is not a database read (build storage, Secret Manager, scheduler, network) | Small, but not zero, and not controlled by app code. Set a budget with alerts and switch on the billing guard (cost-control §5) | ⚠ |
| 14 | The 3D landing page is promoted widely | A first visit downloads roughly 600 KB; 45 GB a month would pass the free 10 GB of Hosting transfer. Table QR codes open the light order site, not the landing page; watch Hosting usage if the landing page is advertised | ⚠ |
| 15 | Dish photos are uploaded | The bucket now exists in `US-CENTRAL1` (inside the free allowance) with rules that accept only JPEG, PNG or WebP under 1 MB from the shop's own admin or the manager. Verified in production with a temporary account: own-folder upload works; another shop's folder, non-images, oversize files, other paths and signed-out visitors are all refused (403) | 🛠 |

## B. Payments and money

| # | Scenario | What happens / protection | Status |
|---|---|---|---|
| 16 | A diner edits the cart in the browser to price a dish at ₹1 | The server ignores prices from the phone and recomputes from the menu (`createCheckout`; tested: orders are created at the server total) | ✅ |
| 17 | A diner orders a dish that has just sold out | Checked against stock on the server at checkout; the diner sees a clear message. The cached menu can be about 1 to 2 minutes behind, so this does happen and is handled there | ✅ |
| 18 | A diner orders 50 of everything (40 lines at 50) | The schema caps a line at 50 and an order at 40 lines. Online it must be paid in full; the kitchen can reject and the money is refunded | ✅ |
| 19 | Double-tap on Pay, or a retry after a flaky connection | The same checkout key always maps to the same order id, so no second order or second Cashfree order (tested) | ✅ |
| 20 | A diner pays, then closes the browser or the phone dies | The order is created by Cashfree's **server-to-server** webhook, not by the browser, so it reaches the kitchen regardless. The diner reopens through the payment return link or the token on their screen. If they clear browser data they lose the tracking view (the kitchen still has the token and name) | ✅ |
| 21 | The webhook never arrives | The reconciler asks Cashfree for orders still unpaid after 2 minutes and creates the tickets (tested) | ✅ |
| 22 | Someone posts a fake "payment successful" webhook | Rejected with 401 unless it carries a valid HMAC signature made with your secret key (verified live: an unsigned request returned 401) | ✅ |
| 23 | A real webhook is captured and replayed later | Safe because handling is idempotent. There is no timestamp-freshness check, so a replay is harmless rather than rejected | ✅ |
| 24 | The paid amount differs from the order total | The order is flagged and **not** fulfilled automatically (tested) | ✅ |
| 25 | The same order is paid twice | Cashfree refuses a second payment on one order id; the order materialises once | ✅ |
| 26 | A refund fails or Cashfree is slow to settle it | The refund is idempotent; the sweeper polls pending refunds and records the final result (tested) | ✅ |
| 27 | A kitchen rejects, or nobody accepts within 3 minutes | The ticket times out and the diner is refunded proportionally (tested) | ✅ |
| 28 | Two phones redeem the same single-use coupon at once | Use and hold records are written in a transaction, so one wins (tested in `coupons.test.ts`) | ✅ |
| 29 | Cashfree is down at checkout | The order is marked failed, nothing is sent to the kitchens, nothing is charged, and the diner sees "try again" (tested) | ✅ |
| 30 | **Pay-at-counter mode is on and anyone sends orders to the kitchens** | With no payment to slow a prankster down, each table session now gets 3 counter orders per 15 minutes and each table 30 (retries of the same order do not count). Many accounts at one table still reach 30, so keep this mode for supervised use (`createCheckout`, tested in `cost.test.ts`) | 🛠 |

## C. Security and access

| # | Scenario | What happens / protection | Status |
|---|---|---|---|
| 31 | Someone guesses a table's QR token | 128-bit random token, format checked (`QR_TOKEN_PATTERN`); an inactive table is refused | ✅ |
| 32 | Someone downloads the tables collection to collect every token | `tables` is manager-only for reads and writes (tested) | ✅ |
| 33 | A diner reads someone else's order or tickets | Rules allow only the owner (`uid` match) or the manager (tested) | ✅ |
| 34 | A diner or kitchen writes an order, ticket, session or payment directly | All of those writes are denied to every client (tested); only functions and the webhook write them | ✅ |
| 35 | A kitchen account tries to move another shop's ticket | The function checks the shop claim against the ticket and refuses; the rules also scope reads (tested) | ✅ |
| 36 | A kitchen account raises its own commission or prep time to 999 | Kitchens may change only pause, resume and prep time within 1 to 120 minutes (rules, tested) | ✅ |
| 37 | A shop admin edits another shop's menu or photos | The menu function uses the shop in the signed token, and photo folders are per shop in the storage rules | ✅ |
| 38 | A staff password is shared, shoulder-surfed, or left on a tablet | Email and password only, no second factor, and the passwords sit in `staff-credentials.local.txt` (git-ignored). Hand them over, delete the file, and use the manager's password reset after any staff change | ⚠ |
| 39 | A staff member is demoted but keeps their old role | The role lives in the sign-in token and refreshes about hourly; disabling the account and changing the password ends it faster | ✅ |
| 40 | A dish name or note carries `<script>` | React renders text as text; notes are capped at 120 characters; dish names come only from shop staff and the manager | ✅ |
| 41 | A malicious file is uploaded as a "photo" | Storage rules accept only JPEG, PNG or WebP under 1 MB, only from the shop's own admin or the manager; a text file and an oversize file were both refused when tested live | ✅ |
| 42 | Secrets leak from the browser or the repository | Cashfree keys are in Secret Manager; the Firebase web key in the app is public by design; credentials files are git-ignored. `docs/runbook.md` covers rotating them | ✅ |

## D. Availability, scale and correctness

| # | Scenario | What happens / protection | Status |
|---|---|---|---|
| 43 | 200 orders for one shop in two minutes | Each paid order bumps that shop's token counter, a single document that handles about one write a second. Bursts above that slow down by retrying, and Cashfree retries any webhook that fails. Watch for slow confirmations; if seen, split the counter | ⚠ |
| 44 | Many website (pickup) orders at once | All pickup sessions share one daily counter document, a hotspot like case 43 | ⚠ |
| 45 | The first order after a quiet spell | No server is kept warm now, so it can be 1 to 3 seconds slower. During a rush instances stay warm | ✅ |
| 46 | The phone goes offline mid-checkout | The call fails, the cart is kept, nothing is charged, the diner sees "check your connection" | ✅ |
| 47 | A kitchen marks a dish sold out and diners still see it for a while | The cached menu can lag by about 1 to 2 minutes (CDN 30 s, browser 15 s, refresh every 90 s). Checkout re-checks on the server, so nobody is charged for it | ✅ |
| 48 | More than 3,000 tickets in a day | The manager's live view holds the newest 3,000; older tickets stay in the database and in the finance reports | ✅ |
| 49 | Shops and menus grow past the size of one document | The cached catalogue is one document (about 130 KB for five shops, limit 1 MiB). Plan to split per shop around 15 to 20 shops | ⚠ |
| 50 | The cached catalogue is missing, or a deploy happens mid-service | The first request rebuilds it from the source documents, and any error is returned uncached with a 503 so the next request retries (tested) | ✅ |

## Summary

- **Safe already: 33. Fixed in this pass: 8. Open: 9.**
- **Open:** cases 3, 4, 5, 13, 14, 38, 43, 44, 49. The ones that need **you**: App Check (4, 5, deferred by choice), the budget and
  billing guard (13) and staff-password handling (38). The ones to **watch**: the cache-bypass flood (3), Hosting transfer
  if the landing page is advertised (14), counter hotspots on busy shops and pickup (43, 44), and the cached catalogue's
  size as shops are added (49).
- The "fixed" cases only take effect once their code is live: the cost fixes (1, 2, 6, 7, 9, 10) are deployed; the photo
  bucket (15) is live; the tighter checkout allowance and counter-order caps (5, 30) need the `createCheckout` deploy.
