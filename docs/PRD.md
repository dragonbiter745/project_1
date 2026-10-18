# FoodCourt — QR Order & Pay POS · Product Requirements Document (v1.0)

**Owners:** Manash & Dibya Bhusal · **Stage:** Build (Month 2 of the 6‑month plan) · **Date:** 17 Oct 2026
**Inspiration:** Toast "Mobile Order & Pay" (scan → browse → pay → kitchen ticket → status) adapted to a multi‑vendor food court.
**Stack (fixed):** Firebase (Auth, Firestore, Functions, Hosting, FCM, App Check, Storage) · Cashfree Payments · built in Google Antigravity.

> **How to use this in Antigravity:** put this file at `docs/PRD.md`, create `AGENTS.md` pointing to it (see §14), then build milestone by milestone (§13). Each milestone has a definition of done. Do not skip ahead.

---

## 1. Vision & Scope

A food court with several shops. Every table has its own QR. A customer scans it, sees **all shops' menus in one app**, builds one cart across shops, pays once via Cashfree, and each shop gets its own kitchen ticket. The customer sees live status per shop and is notified when food is ready.

**Launch shops:** Roll Me, Siddi Vinayaka Garden (menus in Appendix A). Architecture is multi‑vendor from day one — adding a shop = config + menu, no code change.

**Three surfaces**
| Surface | Users | Access |
|---|---|---|
| Customer app (PWA) | Diners | No signup; scan & order; optional login for points |
| Vendor dashboard (one per shop, same codebase, scoped by `vendorId`) | Shop owner / staff | Email/phone login, role `vendorAdmin` / `vendorStaff` |
| Master admin | Founders | Role `master`; sees and controls everything |

### Scope reconciliation with the pitch deck (important)
The pitch deck lists *loyalty wallet* and *POS replacement* as out of MVP and says the pilot may use "the vendor's existing payment process." This PRD **adds Cashfree payments and points earning**. Either update the deck/vision doc, or label these as Phase 2 externally. Internally: build per this PRD, behind feature flags (`payments.enabled`, `loyalty.enabled`) so the pilot can run in "order only / pay at counter" mode if REVA or the vendors don't approve online payments yet.

### Non‑goals (v1)
Delivery fleet, native apps, table reservations, inventory/stock management, full accounting, AI recommendations, multi‑campus tenancy UI (data model supports it via `venueId`, UI does not).

---

## 2. Users & Key Journeys

**Diner (guest):** Scan → land on table‑bound menu → add items from either shop → checkout → pay (UPI/card) → see "Order #042 · Roll Me: Preparing / Siddi Vinayaka: Ready" → collect.
**Diner (logged in):** Same + points earned per order, history, reorder.
**Vendor staff:** Hear alert → accept/reject → mark preparing → mark ready → mark collected. Toggle item out‑of‑stock; pause orders when slammed.
**Founder:** Onboard shop, edit menu, generate table QRs, watch live orders across shops, handle refunds/issues, export reports.

---

## 3. Functional Requirements

### 3.1 Customer app (PWA, mobile‑first, 360px baseline)
- **FR‑C1 Scan & session.** QR encodes `https://order.<domain>/t/{tableCode}`. First visit creates a **session** bound to table + device (Firebase Anonymous Auth). Re‑scan or refresh within the session TTL (3h idle) reuses it.
- **FR‑C2 Identity.** On session creation the server assigns `displayName` (random "Adjective + Food", e.g. "Zesty Mango") and `dailyNo` = the day's running customer number (resets at 00:00 IST). Shown in header as "Zesty Mango · #042". Names are never unique identifiers; `dailyNo` + date is.
- **FR‑C3 Browse.** Shop tabs/chips (Roll Me, Siddi Vinayaka…), category sticky nav, search across all shops, veg/non‑veg filter, item cards (name, price, veg dot, optional photo, tags). Out‑of‑stock items greyed and non‑addable in real time. Shops that paused orders show a banner and block add‑to‑cart.
- **FR‑C4 Cart.** One cart, grouped by shop. Quantity steppers, per‑item note (≤120 chars), persisted locally (survives refresh). Subtotals per shop, one grand total.
- **FR‑C5 Checkout.** Shows table, per‑shop estimated prep time, tax breakdown, total. Optional "Log in to earn N points" nudge (non‑blocking). Pay button → Cashfree checkout (UPI intent first, then UPI collect, cards, netbanking).
- **FR‑C6 Order tracking.** Live screen per order with per‑shop sub‑order status timeline. Ready alert = vibration + sound + banner (+ web push if permitted). Keep‑awake while an order is active.
- **FR‑C7 Failures.** Payment failed/expired → cart preserved, retry. Shop rejects/times out → auto refund + clear message + option to reorder elsewhere. Duplicate tap protection (idempotency key per checkout).
- **FR‑C8 Login & points (phase 1b).** Phone OTP (primary) or Google. Linking upgrades the anonymous user (`linkWithCredential`) so current session and orders are retained, and **already‑paid orders in the current session earn points retroactively**. Points screen: balance, ledger, how it works.
- **FR‑C9 History/reorder** (logged in only): past orders, one‑tap reorder if items still available.
- **FR‑C10 Help.** "Report a problem" on any order → creates issue visible to the shop and master.

### 3.2 Vendor dashboard
- **FR‑V1 Live board (KDS).** Columns: New · Accepted/Preparing · Ready. Real‑time. Each ticket: token (e.g. `RM‑042`), table label, customer display name/no, items + notes, time since placed (colour escalates at 2/5/10 min). **Loud repeating sound for new orders until acknowledged**; works on a tablet left open all day (wake lock, auto‑reconnect, offline banner).
- **FR‑V2 Actions.** Accept (with optional prep‑time override) · Reject (reason required) · Preparing · Ready · Collected. Reject/auto‑timeout triggers refund. Undo last status within 30s.
- **FR‑V3 Controls.** Pause/resume orders (with optional auto‑resume time); per‑item availability toggle (one tap, optimistic UI); default prep time.
- **FR‑V4 Menu management.** CRUD categories/items/prices/veg flag/photo; reorder; bulk CSV import/export. Price changes apply to new orders only. Config flag `menu.priceEditRequiresApproval` (default false).
- **FR‑V5 History & reports.** Today / date range: orders, revenue, avg order‑to‑ready, rejection rate, top items, hourly heatmap. CSV export.
- **FR‑V6 Staff.** Vendor admin can invite/remove staff (staff cannot edit prices or see revenue reports).
- **FR‑V7 Settlements view.** Read‑only list of payouts/settled amounts per day (see §7.5).

### 3.3 Master admin
- **FR‑M1 Vendors:** create/suspend shops, set fees, fulfilment mode, hours, Cashfree vendor linkage, staff roles.
- **FR‑M2 Menus:** full edit across shops; menu import from CSV/JSON.
- **FR‑M3 Tables & QR:** create tables/zones; generate per‑table QR (individual PNG/SVG + print‑ready A4 PDF sheet with table label); deactivate/rotate a QR (tableCode rotation invalidates old print).
- **FR‑M4 Live ops:** all orders across shops, filter by shop/status/table; force status change, cancel, refund (full/partial) with reason; audit‑logged.
- **FR‑M5 Analytics:** scans, sessions, conversion (scan→cart→paid), AOV, revenue by shop/hour/table, repeat‑customer rate, order‑to‑ready (the pitch's core metric), rejection/cancel/error rates, login conversion, points issued.
- **FR‑M6 Customers & loyalty:** search by phone, view ledger, manual adjust (reason required), configure `pointsPerRupee`, expiry, tiers (later).
- **FR‑M7 Issues:** inbox of reported problems with status.
- **FR‑M8 Config & flags:** global settings (tax %, service charge, session TTL, feature flags), maintenance mode banner, CSV exports.
- **FR‑M9 Audit log:** every admin/vendor mutation of price, availability, refund, role, config.

---

## 4. Order & Payment Lifecycle

**Checkout (parent order)** `CREATED → PENDING_PAYMENT → PAID | FAILED | EXPIRED`
**Sub‑order (one per shop)** `NEW → ACCEPTED → PREPARING → READY → COLLECTED` · exits: `REJECTED | TIMED_OUT | CANCELLED` → refund of that sub‑order's amount.
Parent order status is derived: all collected → `COMPLETED`; partially refunded → `PARTIALLY_REFUNDED`.

Rules
- Pay‑first. A shop only ever sees paid orders (kills prank/QR‑photo orders and no‑shows).
- Vendor accept SLA: 3 min (configurable). Missed → `TIMED_OUT` → auto‑refund → notify customer.
- Pending payment TTL: 15 min (Cashfree `order_expiry_time` + scheduled cleanup).
- Token format: `{VENDOR_CODE}-{NNN}` resetting daily per shop (`RM-042`, `SV-017`).
- All prices are integers in **paise**. Never compute totals on the client for payment; server recomputes from the menu.
- Fulfilment mode per shop (config): `pickup` (default; customer collects on READY) or `table_service` (staff delivers to table label). Ticket always shows table.

---

## 5. Non‑Functional Requirements

| Area | Requirement |
|---|---|
| **Load** | Design for **10× launch**: 10,000 scans/day; peak 300 concurrent sessions; 60 paid orders/min across shops; zero degradation at 1,000+ scans/day. |
| **Latency** | Menu interactive < 2.0 s p95 on 4G after scan; order PAID → visible on vendor board < 2 s p95; status change → customer < 1.5 s. |
| **Bundle** | Customer app JS ≤ 150 KB gzipped initial; route‑level code splitting; images lazy, WebP, ≤ 40 KB. |
| **Availability** | 99.5% during operating hours; graceful offline messaging; vendor board auto‑recovers connectivity. |
| **Consistency** | No double‑charge, no lost paid order, no orphaned payment. Idempotent everywhere (checkout, webhook, refund, points). |
| **Security** | See §9. |
| **Privacy** | Collect minimum data: guests store no PII. Phone only on login. Retention: sessions 90d, orders 2y, analytics aggregated. Privacy policy + consent at login. |
| **Accessibility** | WCAG AA contrast, 44px touch targets, no hover‑only UI. |
| **i18n** | English v1; strings externalised so Kannada/Hindi can be added. |
| **Observability** | Structured logs, Cloud Monitoring alerts (payment webhook failures, function error rate, DLQ depth), Crashlytics/Sentry on frontends. |
| **Cost** | Blaze plan with budget alerts (₹ thresholds). At 1k scans/day expected Firebase spend is low; Cashfree gateway fees dominate (§12). |

---

## 6. System Architecture

### 6.1 Overview
```
 Table QR ─► Customer PWA (Firebase Hosting + CDN, App Check)
                │  Anonymous Auth / Phone OTP
                ▼
  Firestore (asia-south1) ◄──── onSnapshot (own orders, menu avail.)
     ▲   ▲                           ▲
     │   └── Vendor Dashboards ──────┘ (query: my active sub-orders)
     │   └── Master Admin
     │
 Cloud Functions v2 (asia-south1, Node 20 / TypeScript)
   ├─ callable: startSession, createCheckout, vendorAction, linkLogin, adminOps
   ├─ http: cashfreeWebhook (signature-verified, idempotent)
   ├─ triggers: onSubOrderWrite (points, push, analytics), onPaymentPaid
   ├─ scheduled/Cloud Tasks: expirePending, vendorSlaTimeout, reconcilePayments, dailyRollup
   └─ Secret Manager (Cashfree keys, webhook secret)
        │
        ▼
   Cashfree (PG: Create Order, Webhooks, Refunds, [Easy Split])
   FCM (web push) · Cloud Storage (item images, QR PDFs) · BigQuery export (analytics, optional)
```

### 6.2 Scalability decisions (for 1000+ scans/day and beyond)
1. **Cheap scan path.** Menu = **one document per shop** (`menus/{vendorId}`, < 1 MB) → 2–3 reads per scan total. Volatile availability lives in a separate tiny doc (`availability/{vendorId}`) so frequent stock toggles don't re‑ship the whole menu; clients listen to it.
2. **Menu CDN cache.** On menu publish, a function writes a versioned JSON (`/menus/{vendorId}.{version}.json`) to Hosting/Storage with long cache headers; client loads the JSON by `menuVersion` (from a tiny config doc) and falls back to Firestore. Cuts reads to ~0 under heavy scanning.
3. **No hot documents.** Firestore sustains ~1 write/s per document. Avoid per‑order writes to shared docs. Counters: `counters/{dateKey}` (customer no.) and `counters/{dateKey}_{vendorId}` (tokens) are updated inside transactions, only on session creation / paid order (≤ a few per second at peak). If contention appears at 10×, switch to **sharded counters** or pre‑allocated number blocks per function instance — interface `nextCustomerNo()` / `nextToken(vendorId)` stays the same.
4. **Targeted listeners.** Customers listen only to their own session's orders (`where sessionId == X`). Vendors listen to `subOrders where vendorId == V and status in [NEW,ACCEPTED,PREPARING,READY]` (small, bounded set). Never listen to whole collections.
5. **Server‑authoritative writes.** Clients cannot write `orders`/`subOrders`/`payments`/`users.points`; only callable functions/webhooks can. Rules enforce this (also stops tampering under load).
6. **Idempotency & retries.** `checkoutKey` (client UUID) dedupes double taps; Cashfree `order_id` = our `orderId`; webhook handler keyed by `cf_payment_id`; points keyed by `orderId`; refunds keyed by `subOrderId`.
7. **Async side effects.** Points, push notifications, analytics rollups run from Firestore triggers / Cloud Tasks with retry + dead‑letter, never in the request path.
8. **Bot / abuse control.** Firebase **App Check** (reCAPTCHA Enterprise/Play‑style for web) on all callables; per‑uid and per‑IP rate limits on `startSession`/`createCheckout`; payment‑first removes spam‑order incentive.
9. **Region & cold starts.** Everything in `asia-south1`. `createCheckout` and `cashfreeWebhook` set `minInstances: 1` (cheap, removes cold start from the critical path).
10. **Data growth.** Orders partitioned by `dateKey` field + composite indexes; nightly rollup into `analyticsDaily` so dashboards never scan raw orders. Optional BigQuery export extension for deep analysis.

### 6.3 Realtime & offline
- Customer and vendor apps use Firestore realtime listeners with local persistence enabled (IndexedDB multi‑tab off for kiosk tablets).
- Vendor board shows connection state; on reconnect, re‑sync and replay alert for any NEW order not yet acknowledged.
- Service worker caches app shell + menu JSON; order creation requires network (blocked with clear message).

---

## 7. Data Model (Firestore)

All money in paise. All timestamps server timestamps. `dateKey` = `YYYY-MM-DD` in Asia/Kolkata. `venueId` on every top‑level doc (single value `reva-fc` now) to allow multi‑venue later.

| Collection | Key fields | Notes |
|---|---|---|
| `venues/{venueId}` | name, timezone, taxConfig, sessionTtlMin | one doc now |
| `vendors/{vendorId}` | name, code(`RM`,`SV`), logoUrl, status(active/suspended), acceptingOrders, pausedUntil, defaultPrepMin, fulfilmentMode, acceptSlaSec, cashfreeVendorId?, feePct/perOrderFeePaise, hours | |
| `menus/{vendorId}` | version, categories[{id,name,sort,items[{id,name,pricePaise,veg,desc?,imageUrl?,tags[],prepMin?,sort}]}] | single doc, < 1 MB |
| `availability/{vendorId}` | unavailable{itemId:true}, updatedAt | tiny, hot-ish |
| `tables/{tableId}` | code(public, in QR), label("T‑14"), zone, active | |
| `sessions/{sessionId}` | uid, tableId, tableLabel, dateKey, dailyNo, displayName, createdAt, lastActiveAt, expiresAt, linkedUserId? | one per guest per visit |
| `orders/{orderId}` | sessionId, uid, tableId, dateKey, items[], totals{subtotal,tax,total}, payment{cfOrderId,cfPaymentId,method,status,paidAt}, status, checkoutKey, createdAt | parent / payment unit |
| `subOrders/{subOrderId}` | orderId, vendorId, token, tableLabel, customerDisplay, items[{id,name,qty,pricePaise,note}], subtotalPaise, status, ts{placed,accepted,preparing,ready,collected}, rejectReason?, refund{status,amount,cfRefundId}? | **vendor queries run here** |
| `users/{uid}` | phone, name?, createdAt, pointsBalance, lifetimeSpendPaise, tier? | only after login; `uid` = Auth uid |
| `pointsLedger/{id}` | uid, orderId, type(earn/redeem/adjust/expire), points, expiresAt?, createdAt | immutable; balance derived by function |
| `paymentEvents/{eventId}` | raw webhook, cfPaymentId, processedAt | idempotency + audit |
| `issues/{id}` | orderId?, subOrderId?, vendorId?, text, status | |
| `analyticsDaily/{dateKey_vendorId}` | counts, revenue, ready‑time p50/p90, hourly[] | written by rollup |
| `config/global` | pointsPerRupee, pointsExpiryDays, gstPct, flags{payments,loyalty,...}, maintenance | |
| `auditLogs/{id}` | actorUid, role, action, target, before, after, at | append‑only |

**Roles (custom claims):** `{role:'master'}`, `{role:'vendorAdmin', vendorId}`, `{role:'vendorStaff', vendorId}`. Guests are anonymous users with no claims.

**Composite indexes (minimum):** `subOrders(vendorId, status, ts.placed desc)`, `subOrders(vendorId, dateKey, ts.placed desc)`, `orders(sessionId, createdAt desc)`, `orders(uid, createdAt desc)`, `pointsLedger(uid, createdAt desc)`.

### 7.1 Customer number & name
`startSession(tableCode)` (callable): validate table active → reuse live session for this uid+table else transaction on `counters/{dateKey}` to get `dailyNo` → pick name from curated list (adjectives × foods, no offensive combos, ~2,500 combos) → create session. Returns `{sessionId, displayName, dailyNo, tableLabel}`.

### 7.2 Pricing & tax
Server computes: Σ(item price × qty) + tax. Menu prices are treated as **GST‑inclusive MRP by default** (open question §16); config flag `taxInclusive`. Optional `platformFee` line (off by default).

### 7.3 Points
`earn = floor(subtotalPaise/100 × pointsPerRupee)` (default **1 point per ₹10 spent**, i.e. `0.1`), credited when a sub‑order reaches `COLLECTED` (not on payment, so refunds can't leak points); refunded/rejected sub‑orders earn nothing. Ledger entries are immutable and idempotent (`earn_{subOrderId}`). **Phase 1:** earn + display. **Phase 2:** redemption as discount at checkout, expiry, tiers.

### 7.4 Anonymous → logged‑in merge
`linkLogin` callable: after Firebase `linkWithCredential` the uid is preserved (no data move). If the phone already belongs to another uid (returning user on a new device), merge: re‑point current `sessions`/`orders` to the existing user, then credit points retroactively for the current session's collected/paid orders.

### 7.5 Payments & settlement (Cashfree)
**Flow**
1. Client → `createCheckout({sessionId, cart, checkoutKey})`.
2. Function validates session, shop open/not paused, item availability, recomputes prices from `menus/*` (ignores client prices), writes `orders/{id}` = `PENDING_PAYMENT`, calls Cashfree **Create Order** (`order_id`, `order_amount` in ₹, `customer_details` using a stable anonymous id + placeholder phone if guest, `order_meta.notify_url`=webhook, `return_url`, `order_expiry_time`). Returns `payment_session_id`.
3. Client opens Cashfree Checkout (JS SDK; UPI intent prioritised on mobile).
4. **Source of truth = webhook.** `cashfreeWebhook` verifies `x-webhook-signature` (HMAC‑SHA256 over timestamp + raw body, secret from Secret Manager), dedupes by `cf_payment_id`, checks amount/currency match the order, then in one transaction sets order `PAID`, creates one `subOrder` per shop with tokens, and enqueues push to vendors.
5. `return_url` page never marks anything paid; it only listens to the Firestore order doc (and shows "confirming payment…").
6. **Reconcile:** `reconcilePayments` runs every 2 min for `PENDING_PAYMENT` orders older than 2 min → Cashfree **Get Order** → settle state. Covers missed webhooks.
7. **Refunds:** `refundSubOrder` calls Cashfree Refund API with `refund_id = sub_{subOrderId}`; status tracked via refund webhooks.

**Settlement to shops (decision needed — see §16):** (a) *Phase 1 default:* all money lands in the founders' Cashfree account; daily payout report per shop (master + vendor "Settlements" view) and manual payouts; (b) *Phase 2:* Cashfree **Easy Split / vendor split** to settle each shop automatically (requires shop KYC onboarding in Cashfree). Data model already carries `cashfreeVendorId` and per‑sub‑order amounts so (b) needs no migration.

---

## 8. Security

- **Firestore/Storage rules (deny by default).**
  - Guests: read own `sessions`, own `orders`/`subOrders` (by `uid`), `menus`, `availability`, `vendors` (public fields), `tables` (by code via function only). No client writes except `issues` create.
  - Vendors: read/write only where `request.auth.token.vendorId == resource.data.vendorId`; may update only allowed fields of `subOrders` (`status` transitions validated in function — rule just denies direct writes; vendor actions go through `vendorAction`).
  - Master: broad read; privileged writes via functions.
- **Server‑side validation** of every state transition (allowed‑transition table) and of prices/availability.
- **App Check enforced** on Firestore + Functions; **reCAPTCHA** on login OTP.
- **Secrets** only in Secret Manager; Cashfree keys never ship to clients (only `payment_session_id`).
- **Webhook hardening:** signature + timestamp tolerance, replay protection via event dedupe, amount re‑verification.
- **QR integrity:** QR carries a short public `tableCode`; rotating code invalidates stolen/old prints. Sessions are cheap and bound to uid+table; pay‑first prevents abuse value.
- **PII:** phone numbers stored only for logged‑in users; admin views mask by default; audit log on views of full phone.
- **Admin hardening:** master accounts require 2FA (Firebase multi‑factor); IP/time anomaly alerts optional.

---

## 9. Analytics & Success Metrics (maps to pitch/vision plan)

Event tracking (Firebase Analytics + `analyticsDaily` rollups): `scan`, `session_start`, `menu_view`, `add_to_cart`, `checkout_start`, `payment_success/fail`, `order_ready_seen`, `login_prompt_shown`, `login_success`, `issue_reported`.

| Metric (from vision plan) | Source |
|---|---|
| Median/p90 order‑to‑ready time | `subOrders.ts.accepted → ts.ready` |
| Order completion rate | collected / accepted |
| Cancellation & error rate | rejected + timed out + failed payments / paid |
| Repeat student usage | logged‑in users with ≥2 orders in 14 days; repeat by device where guest |
| Vendor active usage | % operating days a shop processed ≥1 order in system |
| Support time per vendor | manual log (admin note field on vendor) |
| Funnel | scan → cart → paid conversion |
| Login conversion | `login_success / paid sessions` |

**Targets (goals, not forecasts):** scan→paid ≥ 25%; accept SLA met ≥ 95%; payment success ≥ 92%; login conversion ≥ 15%.

---

## 10. Repository & Folder Architecture (monorepo)

pnpm workspaces + Turborepo. TypeScript everywhere. Customer/vendor/master are separate Vite+React apps (separate Hosting sites, shared packages) so the customer bundle stays tiny and vendor/master code never ships to diners.

```
foodcourt/
├─ AGENTS.md                      # rules for Antigravity agents (see §14)
├─ docs/
│  ├─ PRD.md                      # this file
│  ├─ architecture.md             # decisions log (ADR-style)
│  ├─ runbook.md                  # ops: webhook failures, refunds, outages
│  └─ menus/                      # source menus (md/csv) for seeding
├─ apps/
│  ├─ customer/                   # PWA – order.<domain>
│  │  ├─ public/                  # manifest, icons, sw config
│  │  └─ src/
│  │     ├─ main.tsx · App.tsx · routes.tsx
│  │     ├─ features/
│  │     │  ├─ session/           # startSession, table bind, header identity
│  │     │  ├─ menu/              # shop tabs, categories, search, item card
│  │     │  ├─ cart/              # cart store (zustand), grouping, notes
│  │     │  ├─ checkout/          # summary, Cashfree SDK launcher, return page
│  │     │  ├─ tracking/          # order status, ready alert, push opt-in
│  │     │  ├─ auth/              # phone OTP, link/merge, login nudge
│  │     │  ├─ loyalty/           # points balance & ledger
│  │     │  └─ history/           # past orders, reorder
│  │     ├─ components/ · hooks/ · lib/ (firebase.ts, appCheck.ts, format.ts)
│  │     └─ styles/ (tailwind config, tokens)
│  ├─ vendor/                     # vendor.<domain>
│  │  └─ src/features/ board/ (KDS) · menu-editor/ · availability/ · history/ · reports/ · staff/ · settlements/ · settings/
│  └─ master/                     # admin.<domain>
│     └─ src/features/ live-ops/ · vendors/ · menus/ · tables-qr/ · analytics/ · customers-loyalty/ · issues/ · config-flags/ · audit/
├─ packages/
│  ├─ shared/                     # TYPES + pure logic used by apps AND functions
│  │  └─ src/ types/ (Order, SubOrder, Menu…) · schemas/ (zod) · money.ts · pricing.ts · statusMachine.ts · tokens.ts · names.ts (adjective/food lists)
│  ├─ ui/                         # shared design system (buttons, sheets, toasts)
│  ├─ firebase-client/            # typed Firestore converters, query helpers, listeners
│  └─ config/                     # eslint, tsconfig, tailwind presets
├─ functions/
│  └─ src/
│     ├─ index.ts                 # exports only
│     ├─ callable/ startSession.ts · createCheckout.ts · vendorAction.ts · linkLogin.ts · adminOps.ts · reportIssue.ts
│     ├─ http/ cashfreeWebhook.ts · cashfreeRefundWebhook.ts
│     ├─ triggers/ onOrderPaid.ts · onSubOrderStatus.ts (push, points, analytics) · onMenuPublish.ts (CDN json)
│     ├─ scheduled/ expirePending.ts · vendorSlaTimeout.ts · reconcilePayments.ts · dailyRollup.ts · sessionCleanup.ts
│     ├─ services/ cashfree.ts · counters.ts · points.ts · notifications.ts · refunds.ts · audit.ts
│     └─ lib/ auth.ts (claims guards) · idempotency.ts · errors.ts · logger.ts · rateLimit.ts
├─ firebase/
│  ├─ firebase.json               # hosting targets: customer, vendor, master
│  ├─ .firebaserc                 # projects: dev, staging, prod
│  ├─ firestore.rules · firestore.indexes.json · storage.rules
│  └─ emulators/                  # seed + test data
├─ scripts/
│  ├─ seed/ venue.ts · vendors.ts · menus-from-csv.ts · tables.ts
│  ├─ qr/ generate-qr.ts          # per-table SVG/PNG + A4 PDF sheet
│  ├─ loadtest/ k6-scan-order.js  # 10× traffic simulation
│  └─ set-claims.ts               # grant master/vendor roles
├─ tests/
│  ├─ rules/                      # Firestore rules unit tests (emulator)
│  ├─ functions/                  # unit + integration (webhook replay, idempotency)
│  └─ e2e/                        # Playwright: scan→order→accept→ready
└─ .github/workflows/             # lint+test, deploy per branch (dev/staging/prod)
```

**Environments:** `fc-dev`, `fc-staging`, `fc-prod` Firebase projects; Cashfree **sandbox** for dev/staging, **production** only on prod. Feature flags in `config/global`.

---

## 11. UX Guidelines

- Customer UI: one‑hand thumb zone, sticky bottom cart bar ("2 items · ₹238 · View cart"), sheets not pages, skeleton loaders, no signup wall, veg/non‑veg dots (green/red), prices in ₹ without decimals unless needed.
- Vendor UI: tablet landscape first, large tap targets, high contrast, status colours consistent across apps, never lose a ticket on refresh.
- Master UI: desktop dense tables, filters, CSV export on every list.
- Copy tone: short, friendly; "Zesty Mango, your Roll Me order is ready at the counter."

---

## 12. Cost & Commercial Notes

- Firebase at 1k scans/day: reads ≈ tens of thousands/day with menu‑JSON caching → negligible; Functions/Hosting low. Set budget alerts.
- **Cashfree gateway fees are the real cost** and may exceed the pitch's ₹1/order platform fee hypothesis. Decide who bears the fee (customer convenience fee, shop, or founders) before pilot. Model it in `config/global` (`platformFee`, `gatewayFeeBearer`).
- Per‑order platform fee (vendor‑side) and monthly subscription remain testable via `vendors.feePct/perOrderFeePaise`; report on contribution margin per order in master analytics.

---

## 13. Milestones & Definition of Done (build order for Antigravity)

**M0 · Foundations (3–4 days):** monorepo, lint/CI, Firebase projects + emulators, rules skeleton, shared types/zod, seed script from Appendix A, design tokens.
*DoD:* `pnpm dev` runs three apps against emulators with seeded menus.

**M1 · Customer ordering without payment (1 wk):** `startSession`, name/number, menu browse, cart, checkout creates order in `payments.enabled=false` mode ("pay at counter") → sub‑orders appear.
*DoD:* scan table URL → order created → visible in Firestore with correct split per shop; 100 simulated sessions give unique `dailyNo`.

**M2 · Vendor board (1 wk):** KDS, accept/reject/preparing/ready/collected via `vendorAction`, sound alerts, pause, availability toggles, status → customer live.
*DoD:* E2E Playwright test passes scan→collected; board survives refresh and offline/online.

**M3 · Cashfree payments (1 wk):** `createCheckout`, SDK checkout, webhook, reconcile, auto‑refund on reject/timeout, SLA timeout.
*DoD:* sandbox test matrix passes: success, failure, user abandon, duplicate webhook, missed webhook (reconcile), reject→refund, partial refund on one shop of two.

**M4 · Master admin (1 wk):** vendors, menus, tables & QR PDF, live ops, refunds, audit log, config/flags.
*DoD:* founder can onboard a third shop and print its table QRs with zero code change.

**M5 · Login & points (4–5 days):** phone OTP, link/merge, ledger, points display, retroactive credit.
*DoD:* guest orders → login → points credited once; replaying triggers does not double‑credit.

**M6 · Analytics, hardening, load test (1 wk):** rollups, dashboards, App Check enforced, rate limits, rules tests, k6 at 10× (10k scans/day profile, 300 concurrent), runbook, on‑site dry run with dummy orders.
*DoD:* meets §5 latency/consistency targets; zero P1 bugs in a full‑day dry run with both shops.

**Phase 2 (after pilot evidence):** points redemption, Easy Split auto‑settlement, push notifications at scale, tiers/offers, reorder favourites, Kannada/Hindi, thermal‑printer bridge.

---

## 14. `AGENTS.md` (paste into repo root for Antigravity)

```
# Rules for agents working on FoodCourt
- Source of truth: docs/PRD.md. If code and PRD disagree, ask; don't silently diverge.
- TypeScript strict. Shared types/logic live in packages/shared; never duplicate them.
- Money = integer paise. No floats for money. Format only at the UI edge.
- Clients NEVER write orders, subOrders, payments, points. Only callable functions / webhooks do.
- Never trust client prices or availability. Recompute server-side from menus/availability.
- Every function that mutates money/state must be idempotent (see PRD §6.2.6).
- Status changes must go through packages/shared/statusMachine.ts.
- No secrets in code. Cashfree keys via Secret Manager. Sandbox unless env=prod.
- Firestore: no listeners on whole collections; always filter by vendorId/sessionId/uid.
- Any change touching rules, payments, or refunds requires tests (rules emulator / webhook replay).
- Customer app bundle budget: ≤150 KB gz initial. Don't import vendor/master code or heavy libs.
- Work milestone by milestone (PRD §13); keep each PR to one feature slice; update docs/architecture.md for decisions.
```

---

## 15. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Webhook missed/duplicated → lost or double order | Idempotent handler, reconcile job, `paymentEvents` audit, alerts |
| Vendor ignores new orders | Repeating alert, SLA auto‑refund, board escalation colours, pause control |
| Tablet/Wi‑Fi flakiness in the court | Persistent listeners, reconnect replay, offline banner, 4G fallback device |
| Campus/vendor not approving online payments yet | `payments.enabled` flag → pay‑at‑counter pilot mode |
| Cashfree fees erode margin | Model fee bearer, track contribution margin per order |
| QR photo abuse / bots | Pay‑first, App Check, rate limits, tableCode rotation |
| Daily counter contention at peak | Sharded‑counter swap behind `nextCustomerNo()` |
| Menu/price errors from photo transcription | Shop owners sign off on seed data before go‑live |

## 16. Open Questions (decide before M3/M4)
1. Settlement model for Phase 1: founders collect & pay out manually, or Easy Split from day one?
2. Who bears Cashfree gateway fee, and is a customer convenience fee acceptable?
3. Are menu prices GST‑inclusive? Do shops need GST invoices / FSSAI details on receipts?
4. Fulfilment per shop: counter pickup or table service?
5. Do both shops share one accept SLA and prep‑time defaults, or per shop?
6. Points rate (default 1 point/₹10), expiry, and what points will be redeemable for.
7. Venue hours and daily cut‑off for "customer number" reset (default 00:00 IST).
8. Permission/approval status from REVA for online payments and QR placement (do not state as approved without written approval).

---

# Appendix A — Seed Menus (transcribed from photos)

Prices in ₹ (store as paise). `V` = vegetarian. **Owners must verify** all items marked ⚠ (hard to read in the photo) and the whole Siddi Vinayaka Breakfast block before go‑live. Seed via `scripts/seed/menus-from-csv.ts`.

## A1. ROLL ME (vendor code `RM`)

**Rice**
Biriyani Rice 99 · Donne Biriyani Rice 99 · Hyderabadi Chicken Biriyani 159 · Donne Chicken Biriyani 159 · Lollipop Chicken Biriyani 159 · Grill Chicken Biriyani (2 pcs grilled chicken + Hyd. biriyani rice) 199 · Chicken 65 Biriyani (Boneless) 199 · Egg Biriyani 129 · Naati Egg Rice 89 · Naati Chicken Rice 129 · Ghee Rice 99

**Noodles**
Egg Noodles 89 · Schezwan Egg Noodles 109 · Chicken Noodles 109 · Schezwan Chicken Noodles 129

**Andra Chicken Special**
Spicy Wings 149 · Pepper Wings 159 · Chicken Pepper Dry 159 · Govan Chicken 159 · Royal Chicken 159 · Lollipop 666 159

**Curry**
Egg Curry 99 · Chicken Masala 139 · Chicken Chop 139

**Indian**
Chicken Kebab 129 · Chicken Kebab Boneless 149 · Chicken Lollipop 149 · Grill Chicken Quarter 119 · Grill Chicken Half 119 ⚠ (likely higher; verify) · Grill Chicken Full 379

**Chicken Platter**
Hyderabadi Chilli Chicken 149 · Chicken Manchurian 149 · Lemon Chicken 169 · Garlic Chicken 149 · Chicken 65 149 · Domestic Chicken 149 · Dom. Chicken Lollipop 179 · Egg Chilli 119

**Indian Bread**
Parota 19 · Chapati 19 ⚠ · Kuboos 15

**Lassi**
Sweet Lassi 59 · Mango Lassi 59 · Strawberry Lassi 59

**Shawarma**
Regular Shawarma 99 · Whole Chicken Shawarma 129 · Plate Shawarma 149 · Paneer Shawarma (V) 99 · Plate Paneer Shawarma (V) 149

**Rolls (Non‑Veg)**
Chicken Liver Roll 49 · Double Egg Roll 59 · Chicken Kebab Roll 69 · Chicken Tikka Roll 79 · Chicken Egg Kebab Roll 89 · Chicken Egg Tikka Roll 99 · Double Chicken Liver Roll 79 · Double Chicken Kebab Roll 99 · Double Chicken Tikka Roll 109 · Roll Me Special 129

**Rolls (Veg)** (all V)
Potato Roll 49 · Mushroom Roll 59 · Babycorn Roll 59 · Paneer Roll 69 · Double Paneer Roll 89 · Double Mushroom Roll 79 · Double Babycorn Roll 79 · Chef's Special 99

**Combos**
Grilled Chicken Quarter + 2 pcs Kuboos 139 · Parota + Egg Curry 79 · Chapathi + Egg Curry 79 · Idli + Chicken Chop Curry 99 · Parota + Chicken Curry 99 · Chapathi + Chicken Curry 99 · Govan Chicken + 2 pcs Parota 99 · Biriyani Rice + 2 pcs Kebab 129 · Donne Biriyani Rice + 2 pcs Kebab 139 · Naati Egg Rice + 2 pcs Kebab 139 · Ghee Rice + 2 pcs Kebab 139 · Naati Chicken Rice + 2 pcs Kebab 159 · Rice + Chicken Curry + 2 pcs Kebab + Parota/Chapati + Salad 159 · Hyderabadi Chicken Biriyani + 2 pcs Kebab 189 · Donne Chicken Biriyani + 2 pcs Kebab 189

**Featured (counter poster)**
Chickpet Donne Biriyani 149 · Chickpet Donne Biriyani Combo 179

## A2. SIDDI VINAYAKA GARDEN (vendor code `SV`) — all vegetarian (V)

**Breakfast** ⚠ *(verify entire block against printed prices)*
Coffee / Tea / Badam 15 · Green Tea / Lemon Tea 15 · Boost / Horlicks 20 · Butter Milk 15 · Soft Drink 20 · Cold Badam Milk 35 · Idly 2 pcs 35 · Idly 3 pcs 45 · Idly Vada 65 · Single Idly Vada 50 · Vada 1 pc 30 · Khara Bath 35 · Chow Chow Bath 60 · Rice Bath 60 · Poori 60 · Pakoda/Bajji 35 · Rava Idly 35 · Thatte Idly 35 · Curd Vada 35 · Mangaluru Bun 35 · Pongal 60 · Shavige Bath 65 · Bounda Soup (2 Nos) 40 · Avalakki 40

**Dosa**
Plain Dosa 50 · Masala Dosa 65 · Khali Dosa 55 · Set Dosa 65 · Paper Masala Dosa 90 · Paper Plain Dosa 65 · Ghee Masala Dosa 75 · Butter Masala Dosa 75 · Tomato Dosa 70 · Rava Dosa 55 · Rava Onion Dosa 60 · Rava Onion Masala Dosa 80 · Onion Dosa 70

**Special Dosa**
Cheese Masala Dosa 90 · Rava Cheese Masala 100 · Paneer Cheese Masala 120 · Mysore Masala Dosa 85 · Mysore Masala with Cheese 100 · Corn Masala Dosa 90 · Corn Masala with Cheese 100 · Pineapple Dosa 80 · Beetroot Dosa 80 · Palak Dosa 80 · Ragi Dosa 80

**Rotis**
Parota Curry 60 · Channa Batura 75 · Aloo Parota 65 · Aloo Parota with Cheese 75 · Chapathi 3 Nos / Curry 60 · Chapathi 4 Nos / Dal Fry 100 · Dal Fry 80 · Paneer Burji 99 · Parota 1 No 20 · Chapathi 1 No 15

**Lunch**
South Indian Meals 75 · Parota Meals 80 · Curd Rice 60 · Rice Sambar 60

**SVG Special**
Dal Khichdi 100 · Palak Khichdi 110 · Gobi Rice 100 · Idli Manchurian 80

**Starters**
Paneer Hyderabadi 110 · Paneer Kabab (10 Nos) 110 · Paneer Pepper Fry 110 · Paneer Chilli 100 · Mushroom Kabab 110 · Mushroom Pepper Fry 100 · Mushroom Chilli 100 · Baby Corn Kabab 110 · Baby Corn Pepper Fry 100 · Baby Corn Chilli 100 · Gobi Kabab 90 · Gobi Pepper Fry 90 · Gobi Dry Chilli 90 · Aloo Kabab 80 · Aloo Dry Chilli 80 · Soya Chilli 90

**Noodles Spl**
Veg Noodles 75 · Veg Cheese Noodles 85 · Gobi Noodles 100 ⚠ · Paneer Noodles 80 · Paneer Cheese Noodles 90 · Mushroom Noodles 80 · Mushroom Cheese Noodles 90 · Schezwan Noodles 90 · Singapore Noodles 90

**Manchurian**
Gobi Manchurian 90 · Aloo Manchurian 70 · Paneer Manchurian 100 · Babycorn Manchurian 100 · Mushroom Manchurian 100 · Paneer 65 110 · Mushroom 65 110 · Soya Manchuri 90

**Rice Spl**
North Indian Veg Biriyani 80 · Schezwan Rice 80 · Paneer Schezwan Rice 95 · Mushroom Schezwan Rice 95 · Veg Fried Rice 70 · Ghee Rice 75 · Jeera Rice 75 · Mushroom Fried Rice 80 · Paneer Fried Rice 80 · Sweet Corn Rice 75 · Green Peas Rice 75 · Coconut Rice 60 · Triple Fried Rice 90 · Singapore Rice 80 · Soya Fried Rice 80

**SVG Dessert Spl**
Jamoon 20 · Kesari Bath 35 · Carrot Halwa 35 · Champakali 25 · Holige (Dal / Coconut) 25

**Combos**
Fried Rice + Gobi Manchuri + French Fries 125 · Dum Biriyani + Paneer Chilli + Jamoon 165 · Paneer Semi Gravy + Chapathi/Parota (3 Nos) + Jamoon 179 · Paneer Bhurji + Chapathi/Parota (3 Nos) + Jamoon 179 · Dal Khichdi + Soft Drinks + Jamoon 149 · Gobi Rice + Soft Drinks + Jamoon 149
