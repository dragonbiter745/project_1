# FoodCourt — Architecture Decision Record (ADR) & System Blueprint

## ADR 001: Monorepo Architecture & Package Boundaries
- **Decision:** Use pnpm workspaces + Turborepo for monorepo management.
- **Apps:**
  - `apps/customer`: Mobile-first PWA (`order.<domain>`) built for diners scanning QR codes. Strictly bounded to ≤ 150 KB gzipped initial bundle.
  - `apps/vendor`: Tablet-first KDS & management portal (`vendor.<domain>`) scoped by `vendorId`.
  - `apps/master`: Desktop-dense operational portal (`admin.<domain>`) for founders and food court ops.
- **Packages:**
  - `packages/shared`: Universal domain types (Order, SubOrder, Menu, Session, etc.), Zod schemas, integer-paise math helpers, status state-machine, token generators, and funny name generators. Consumed by both client apps and Cloud Functions.
  - `packages/ui`: Design tokens (CSS custom properties, Tailwind presets), responsive layout primitives, alerts, badges, touch targets.
  - `packages/firebase-client`: Typed Firestore converters, Auth wrappers, reactive hooks, and listeners.
  - `packages/config`: Common ESLint, Prettier, and TypeScript configs.

## ADR 002: Money & State Integrity
- **Paise-Only Math:** All monetary figures are stored and processed strictly as 64-bit integer paise (1 INR = 100 paise). No float arithmetic on money. Formatting with `₹` and decimals occurs strictly at the UI display layer.
- **Server-Authoritative Pricing:** Client carts submit item IDs, quantities, and customizations. The server re-calculates the price directly from the verified database menu.
- **Server-Authoritative State:** Firestore security rules deny direct client updates to `orders`, `subOrders`, `payments`, `pointsLedger`, and `users.pointsBalance`. Only authenticated Cloud Functions or verified PG Webhooks execute mutations.

## ADR 003: Idempotency & Scalability (10x Launch Profile)
- **Cart & Order Deduplication:** Client generates an ephemeral UUID `checkoutKey`. If tapped twice, the function detects `checkoutKey` and returns the existing `orderId` and `paymentSessionId`.
- **Payment Webhook:** Verified via HMAC-SHA256 signature against Cashfree raw body and timestamp. Deduped using `cf_payment_id` written inside a Firestore transaction.
- **Menu Caching (Cheap Scan Path):** Menus are stored in a single document per vendor (`menus/{vendorId}`). Availability overrides are stored in a micro-document (`availability/{vendorId}`). On menu publish, static JSON is rendered for CDN distribution, dropping per-scan Firestore read costs to near-zero.
- **Real-time Isolation:** Vendor dashboards only listen to active `subOrders` (`status in ['NEW', 'ACCEPTED', 'PREPARING', 'READY']`). Customers only listen to their active `sessionId`.

## ADR 004: Customer App Frontend Foundations
- **Bundle budget:** Initial JS 93 KB gz (was 171 KB). Firebase Auth loads on idle, Functions and the Cashfree SDK load when the cart opens, confetti loads on the first READY alert. `@foodcourt/shared` is `sideEffects: false` so unused zod schemas tree-shake away.
- **firebase-client subpaths:** `./app`, `./auth`, `./functions`, `./local-store`. The root export is unchanged for vendor/master; the customer app imports subpaths only, so Firestore never enters its bundle until it is actually used.
- **Structure:** `src/features/{session,menu,cart,checkout,tracking,auth,account,ui}` per PRD §10, `src/components/ui` for customer-only primitives. Cart is a persisted Zustand store (`fc_cart_v1`).
- **Rendering:** `useLocal(selector, isEqual)` wraps `localStore` with `useSyncExternalStore`, so a cart change re-renders one item row instead of the whole menu. Swapping to targeted Firestore listeners later is contained to these hooks.
- **Design system:** light theme only, Geist (self-hosted, includes ₹), one saffron accent, ink primary CTA, RGB-channel CSS tokens so Tailwind opacity modifiers work. Motion is CSS transitions / WAAPI only (no animation library), every effect honours `prefers-reduced-motion`.
- **Table binding:** the table comes from the QR path `/t/{tableCode}`; the in-app table picker was removed.
- **Menu navigation (PR 2):** sticky header is only the shop switcher + section rail (113 px at 360 px wide); identity scrolls away. The rail is a scroll-spy driven by one IntersectionObserver on a 1 px line under the header plus a page-end sentinel (no scroll listeners). Long tap-jumps snap most of the way and glide the last half-screen.
- **Search & back gesture (PR 2):** search spans every shop with a consonant-skeleton fallback for spelling drift (biryani/biriyani). Sheets and search each own one history entry (`lib/backStack.ts`) so the Android back gesture closes the top layer instead of leaving the app.
- **Cart & checkout feedback (PR 3):** Sonner toasts (top-center, clear of the cart bar, lazy-loaded on idle via `lib/toast.ts` so the 10 KB stays off the critical path) replace `alert()`; payment start failures offer "Try again" and keep the cart. Removing a line or clearing the cart offers Undo. Pay is blocked with a stated reason when offline (PRD §6.3) or when a cart line's shop is paused or item sold out; the server still re-validates everything.
- **Tracking (PR 4):** Wake Lock held while any sub-order is open (re-acquired on tab return). Cards show elapsed time and a typical-wait hint from the shop's default prep time (worded as typical, not promised). "Show token" opens a full-screen token for the counter. "Report a problem" writes `issues/{id}` directly (the one client-writable collection per rules); Firestore loads lazily on first report via `@foodcourt/firebase-client/issues`.
- **Account (PR 5):** sign-in is two steps (phone, then name/ID) with OTP to be inserted between them in M5; no verification is faked. Orders placed on the device are kept in `fc_order_history_v1` for history and one-tap reorder (re-priced from today's menu, unavailable dishes skipped and named). Points shown are computed from COLLECTED sub-orders on the device until the server ledger exists.
- **QA pass (PR 6):** Lighthouse mobile accessibility 100 (VegDot gained `role="img"` in packages/ui). Menu DOM cut 41% by mounting the qty stepper on first add (`@starting-style` keeps its fade). First menu item in the DOM at ~620 ms on Fast 4G + 4x CPU throttle; CLS 0. Worst-case data (unbreakable names, 99 qty, ₹1,28,601 totals, long diner names) verified at 360 px. `robots.txt` disallows crawling: table pages are not meant to be indexed.

## ADR 005: CI/CD
- **Decision:** one GitHub Actions pipeline per deployable: Frontend · Customer / Vendor / Master (sharing the reusable `_frontend.yml`), Backend · Cloud Functions, and Firebase · Rules & indexes. Path filters mean a change only runs the pipelines it can affect; shared packages fan out to all three frontends.
- **Frontends:** verify (package typecheck, app build, customer bundle budget via `scripts/ci/check-bundle-size.mjs`) then deploy that artifact: preview channel per PR, live on `main`.
- **Backend and rules deploy behind approval** (`backend-production`, `firebase-production` environments). Rules are validated offline by loading them into the emulators (`scripts/ci/validate-rules.mjs`); booting the emulators alone was verified not to catch syntax errors. Functions still read Cashfree config from `process.env`, so the deploy writes `functions/.env` from environment secrets and deletes it. Follow-up: Secret Manager (`defineSecret`) per AGENTS.md, with webhook tests.
- **Known gap:** `functions` depends on a packed `foodcourt-shared-0.1.0.tgz`, not the workspace package, so `packages/shared` changes don't reach functions until it is re-packed.

## ADR 006: Shared UI kit and the vendor kitchen display
- **Kit in `packages/ui/src/kit`:** Button, IconButton, Sheet, QtyStepper, Skeleton, back-gesture and scroll-lock helpers, `useNow`, `useWakeLock`, `useStoreSelector`, motion CSS (`kit.css`) and a Tailwind preset (`tailwind-preset.mjs`). Components use token class names (`bg-surface`, `text-ink-3`, `bg-scrim`, `text-on-accent`); each app defines the token values, so the customer app is light and the kitchen display dark with the same components. The pre-redesign `Button` lives on as `LegacyButton` until master is rebuilt.
- **`useStoreSelector` modes:** `localStore` mutates in place, so structural selections (`'json'`) compare a serialised key and return a fresh copy on change; `'ref'` is for slices that are replaced. Found when the kitchen board did not re-render after its own same-tab mutations.
- **Vendor app (PR V1):** dark tablet-first board (New / Cooking / Ready, one column at a time below 1024 px). Every status change goes through `canTransitionSubOrder`; Accept records ACCEPTED then PREPARING; Ready is undoable for 30 s (READY→PREPARING); Collected is held for 10 s before commit because the machine has no way back from COLLECTED. A "Start service" tap unlocks audio (browsers block it otherwise) and the wake lock; the new-order chime repeats every 4 s while any ticket is NEW. Timed pauses auto-resume. Rejections record `refund.status = 'PENDING'`; the refund itself is server-side.
- **Light theme everywhere (decision 2026-10-19):** the kitchen display uses the same light palette as the customer app (the dark KDS was rejected). White-on-saffron fails AA at 16 px, so filled accent controls use `accent-ink` (≈5.3:1).
- **Vendor Today (PR V2):** collected orders, collected sales, median accept-to-ready (PRD §9 core metric), rejected/missed count, finished-order log, and the shop's usual prep time (feeds the customer wait estimate).

## ADR 007: Master admin redesign
- **Shell:** light desktop console (sidebar ≥1024 px, chip nav below), hash routes `#/live`, `#/shops`, `#/tables`, `#/insights`, `#/settings`.
- **Shared ops:** the local stand-ins for vendorAction/adminOps moved to `@foodcourt/firebase-client/local-ops` (status-machine checked, used by vendor and master); `todayStats` moved to `@foodcourt/shared`; `PauseSheet` to the UI kit. Legacy `Badge`, `LegacyButton` and the old `tokens.css` were deleted.
- **Live orders:** cross-shop table with shop/status filters and search. Cancel is offered only where `canTransitionSubOrder(status, 'CANCELLED')`, needs a reason, and records `refund.status = 'PENDING'` (the old screen marked refunds PROCESSED with a fake id and bypassed the machine).
- **Tables & QR:** QR codes are generated in the browser with `qrcode` (lazy 10 KB chunk); the old screen sent every table code to api.qrserver.com. Print uses an A4 print stylesheet, three codes per row.
- **Insights:** today only, computed from tickets; no placeholder numbers (the old screen showed a hard-coded 8 min when there was no data).
- **Settings:** payments and maintenance switches behind confirmation sheets. The customer app now honours maintenance (notice + Pay blocked). It does not yet honour `paymentsEnabled = false` (pay-at-counter needs a createCheckout change).

## ADR 008: Visual upgrade for vendor and master (redesign-existing-projects audit)
- **Problem:** both apps read as plain black-and-white: brand colour only on a few buttons, identical bordered white tiles, no depth, no charts, weak empty states.
- **Kit additions:** `BrandMark` (saffron squircle logo), `Monogram` (shop code tile), `.ambient` saffron light, fixed `.grain` overlay, `.live-dot` for real live state, and a warm-tinted `shadow-card` token.
- **Master:** branded sidebar with active indicator and a live "Right now" card; page header with description and live clock; bento KPIs (`KpiTile`, featured saffron tile with a sales sparkline); status filters with counts; table rows with shop monograms, table chips and age chips; shop cards with a tinted header, icon metrics and a stock bar; Insights charts (hourly orders bars with hover tooltips, sales-by-shop bars) built to the dataviz skill's mark specs, saffron validated against the light surface.
- **Vendor:** shop monogram and live clock in the top bar; status-tinted columns with icon headers; tickets with a status edge, table chip, quantity badges and note callouts; branded shop picker and start-service card.

## ADR 009: Phone layout for the kitchen display
- **Context:** shop staff also run the board from a phone; the tablet layout squeezed onto a phone put every control out of thumb reach.
- **Decision:** under 768px the vendor app switches to a one-handed layout: slim header, a snapping rail of full-width columns (native CSS scroll snap), a bottom tab bar whose indicator follows the scroll position directly, a More sheet for Today / Stock / Pause / alarm / switch shop, and a new-order alert that drops in from the top while the cook is on another column.
- **Gestures:** tickets swipe right to advance (Accept, Ready, Collected) and left on a new order to open Reject. They are built on pointer events with `touch-action: pan-y`, so vertical scrolling stays native. A commit needs 38% of the card width or a quick flick (0.11 px/ms). The existing buttons and undo windows stay as the fallback. No gesture library was added.
- **Haptics:** `navigator.vibrate` where supported (Android); it does nothing on iOS.
- **Trade-off:** a swipe that starts on a ticket belongs to the ticket, so switching columns sideways only works from a column header, an empty column or the tab bar.

## ADR 010: Landing page with a live 3D court (apps/landing)
- **Decision:** a separate Vite app so the 3D stack (three, R3F, drei, postprocessing) never touches the customer bundle budget. Brand stays REVA Food Court. The 3D hero is a live demo; "Order now" sends diners to the customer app, so ordering logic is not duplicated.
- **Simulation:** a pure TypeScript engine at a fixed 30 Hz, unit-tested in Node. Sub-order status changes go through `canTransitionSubOrder`. Money stays in integer paise and demo totals use `computeOrderTotals`.
- **Rendering budget:** static pieces merge into one mesh per material, and people are one instanced mesh per body part, so draw calls stay well under 250. Textures are generated on canvases. Quality presets step automatically with `PerformanceMonitor`. The canvas stops rendering when scrolled away, and the sim keeps ticking for the dashboard section.
- **Loading:** React, vendor and page code load first so the text paints immediately. The three and R3F chunks load with the lazily imported `World`.
- **Not built:** the Walk (WASD) camera from the original brief. Orbit, Follow and Cinematic cover the demo.

## ADR 011: Launch hardening (backend security, Firestore-backed apps)
- **Context:** an audit before launch found the three apps still on the browser-only demo store,
  Auth never initialised, forgeable payment webhooks, an open payment endpoint, multi-shop orders
  failing after payment (transaction reads after writes), and a dev bypass on kitchen actions.
- **Decisions:** apps read a Firestore-backed live store with the old shape (REST for the diner's
  catalog to keep the 150 KB budget, scoped listeners elsewhere) and write only through callables
  or rule-checked documents; sessions start from per-table 128-bit QR tokens; every callable is
  rate-limited (shared per-user windows in Firestore, generous per-instance IP limits for campus
  NAT); Cashfree keys in Secret Manager; signed webhooks with amount checks; deterministic order
  and ticket ids for idempotency; a one-minute sweeper and a refund trigger.
- **Testing:** 25 emulator tests (callables, webhook replay, sweeper, refunds, rules) run in CI.

## ADR 012: Finance console (apps/finance)
- **Context:** the court collects every online payment in one Cashfree account and owes each shop
  its share. Finance staff need one place, for all shops, to see collections and refunds, what
  each shop is owed, and to record the transfers they make.
- **Decisions:** a separate app and site (`reva-nest-finance`) with its own `finance` role claim;
  the court manager can open it too. Each ticket stores `paymentMode` and `commissionPaise` when
  it is created, so a rate change only affects later orders. Totals come from the
  `financeReport` callable using Firestore aggregation queries (count/sum, one read per 1,000
  tickets), never by downloading tickets. Payouts are written only by `financeAction`
  (idempotent via a per-form request key), never deleted, only voided with a reason; every
  finance write adds an `auditLogs` entry.
- **Money rules:** shop share = online sales of non-failed tickets − commission on online and
  counter tickets (the shop already holds counter cash). Balance due = all-time share − payouts.
- **Not built (kept simple on purpose):** Cashfree settlement and fee reconciliation, GST
  returns, expense tracking, double-entry journals. Gateway fees appear on Cashfree settlements.
