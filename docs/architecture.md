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

## ADR 012: Finance: court income in master, a finance page per shop
- **Context:** the court collects every online payment in one Cashfree account and owes each shop
  its share. The court needs its income and payouts; each shop needs its own earnings, privately.
- **Decisions:** court finance (commission income, every shop's balance, payouts, commission
  rates, payment ledger) is a **Finance** page in the master console, master-only. Each shop has
  a separate finance login (role `vendorFinance` + `vendorId`) on `reva-nest-finance`, distinct
  from the kitchen login, that shows only that shop: earnings, commission, payments received,
  its orders. Both screens live in `packages/finance-ui`.
- **Data:** each ticket stores `paymentMode` and `commissionPaise` when it is created, so a rate
  change only affects later orders. Totals come from aggregation queries in the `financeReport`
  (master) and `shopReport` (own shop from the token's vendorId) callables. Payouts are written
  only by `financeAction` (master, idempotent via a per-form request key), never deleted, only
  voided with a reason; each write adds an `auditLogs` entry. Rules let a shop's finance login
  read its own tickets and payouts only, never orders (other shops' items, diner phones).
- **Money rules:** shop share = online sales of non-failed tickets − commission on online and
  counter tickets (the shop already holds counter cash). Balance due = all-time share − payouts.
- **Trends and comparison:** both reports return a series (IST hours for one day, days up to 62
  days, weeks beyond) and the same totals for the previous period of equal length. Each bucket is
  four aggregation queries; charts are hand-drawn SVG in the saffron accent (palette validated).
- **Not built (kept simple on purpose):** Cashfree settlement and fee reconciliation, GST
  returns, expense tracking, double-entry journals. Gateway fees appear on Cashfree settlements.

## ADR 013: Founder books replace the expense spreadsheet
- **Context:** three founders (Dibya, Manash, Sahil Shingh) tracked spending in a spreadsheet.
  The goal is no spreadsheet at all: the master console is the books.
- **Decisions:** master → Finance gets **Revenue & expenses** and **Founders** tabs. Revenue is the
  court's commission, computed from orders (no entry needed). Expenses, founder investments and
  withdrawals are `founderLedger` entries written only by `financeAction` (master, idempotent,
  never deleted, voided with a reason, audit-logged). Partners and shares live in
  `founders/partners` (basis points, must total 100%; defaults to the three founders).
  `computeFounderBooks` and `splitByShare` (largest remainder, exact to the paisa) in
  `packages/shared` produce the monthly report, each founder's balance (put in + expenses paid
  personally + profit share − withdrawn), the over-drawn check and the printable partner share
  report. `founderReport` returns lifetime and per-month court income via aggregation queries.
- **Not built:** spreadsheet sync or import (deliberately), GST filing, double-entry journals.

## ADR 014: Real customer accounts and the account hub
- **Context:** customer "sign in" only kept a name and number on the phone. The founders want
  login optional but worth it, and a full account area like Zomato or Zepto.
- **Decisions:** Google sign-in only (free); phone OTP dropped because SMS costs money. Guests are
  anonymous Firebase users; signing in upgrades the same uid with `linkWithPopup`, so the cart,
  table session and today's orders stay put. A returning diner on a new phone signs into their
  existing account; the client sends the old anonymous user's ID token and `accountAction SYNC`
  verifies it and moves that guest's sessions, orders, tickets, points and customer summary across
  (`mergeGuest`, idempotent; PRD §7.4). `accountAction` also handles profile (the name on tokens),
  preferences (veg only, order updates, offers consent), favourites and account deletion (profile
  deleted; kept orders lose name and number). The account hub is its own lazy chunk: orders with
  filters, order detail, printable receipt, favourites, coupons, payments and refunds, points,
  notifications, profile, help, privacy (download or delete). Sign-in prompts promise no amounts,
  only that coupons are coming. Cards are never stored by us: Cashfree and UPI apps keep them.

## ADR 015: Customer analytics in master
- **Decisions:** one server-written summary per diner (`customers/{uid}`: distinct visit days,
  orders, spend, per-shop and per-category totals) and one record per diner per day
  (`visits/{uid}_{date}`: first visit, ordered). Both are written inside the same transactions
  that open sessions and confirm orders, so they cannot drift, and each diner has their own
  documents, so busy hours never contend on a shared counter. `customerInsights` (master) uses
  aggregation queries for KPIs and visitors per day or week. Order items now carry `categoryId`.
  Master → Customers lists segments with paged queries (never a whole-collection listener).

## ADR 016: Coupons are paid by the court
- **Decisions:** a coupon never changes a shop's ticket: shops are paid their full menu price and
  commission is worked out on it; the court absorbs the discount, so court income in Finance and
  founder revenue are commission less coupons (`couponCostPaise` on each order). Coupons apply to
  online payment only (at the counter the shop holds the cash). Scope is the whole court, chosen
  shops or chosen menu categories; rules cover percent with cap or flat, minimum order, signed-in
  only, first order only, per-diner and total limits, start and end. One shared `evaluateCoupon`
  drives both the cart preview and the server, which always re-checks from scratch. A hold
  (`couponHolds`) stops one coupon being used in two payment windows at once; the use is counted
  when payment succeeds and handed back if every shop's part fails. Secret codes stay secret:
  diners see coupons only through `dinerCoupons` (rate-limited), never by reading the collection.
- **Known limit:** the total-uses limit is checked at checkout, so two diners paying at the same
  moment can take it one over. Acceptable at food-court volume.

## ADR 017: Notifications without email (for now)
- **Decisions:** web push through Firebase Cloud Messaging (free). A plain service worker
  (`/sw.js`) shows data-only pushes and opens the right screen; FCM loads lazily. Diners are asked
  after ordering, the moment they most want it. Order-ready and refund pushes go to anyone who
  allowed them (guests too) unless they turned order updates off. Court messages (`campaignAction`,
  master) go to signed-in diners' in-app inbox; phone alerts only to those who opted in to offers.
  Audiences: everyone signed in, regulars, new, lapsed, ordered from a shop, ordered a category,
  chosen diners, or kitchens (an announcement on the kitchen display). Sends are idempotent per
  form submission and per campaign (SCHEDULED → SENDING claim); scheduled sends go out from a
  5-minute sweeper. iPhone push needs Add to Home Screen, so the app ships a manifest and icons,
  and a home-screen launch returns to the last table scanned. Email is paused by decision; when it
  comes, it reuses the same audiences with Brevo through the Trigger Email extension.
- **Setup needed:** a Web Push key pair in the Firebase console (`VITE_FIREBASE_VAPID_KEY`).
  Without it, push stays off and messages still reach the inbox.

## ADR 018: Shop Admin replaces the shop finance site
- **Context:** each shop has two sites: the kitchen order screen (`apps/vendor`) and a money-only
  finance site. Owners also need to change their menu and shop details without asking the court.
- **Decisions:** `apps/finance` is now `apps/admin` (Hosting target `admin`, same site id
  `reva-nest-finance`). One owner login (the existing `vendorFinance` claim + `vendorId`) opens
  Home, Menu, Money and More; the kitchen keeps its own `vendorAdmin`/`vendorStaff` login. The
  claim name is unchanged for now to avoid re-provisioning accounts.
- **Menu and settings:** dishes, prices, sections, order, photos, hours, prep time, pickup/table
  service and the kitchen password go through one callable, `shopAdmin`. Clients still never write
  `menus` or `vendors` (rules unchanged, covered by a rules test). The server takes the shop from
  the token, bounds prices to ₹1–₹5,000 integer paise, accepts only that shop's own Storage
  images, caps the menu at 300 dishes, writes `menus/{id}` in a transaction (version +1), clears the
  sold-out flag of a removed dish and adds an `auditLogs` entry (area `shop-admin`). Dish and
  section ids come from the form's `requestKey`, so a double tap lands once. Price changes need no
  approval (`menu.priceEditRequiresApproval` stays unused); they apply to new orders only because
  checkout re-reads the menu.
- **Photos:** shrunk to ≤1000px JPEG on the phone, uploaded to `menus/{vendorId}/…`. Storage rules
  allow only that shop's `vendorFinance` login (or master), images under 1 MB.
- **Kitchen password:** `SET_KITCHEN_PASSWORD` looks the account up by email and only changes it
  when its claims say kitchen role + this shop; every miss returns the same message. The password is
  never logged. The admin login's own password change (by email) is deferred.
- **Money:** the Money tab is the old earnings page (ShopFinance) under a hero that reuses the login's
  3D rupees (`moneyScene`), lazy-loaded and skipped for reduced motion or no WebGL.

## ADR 019: Website pickup orders
- **Context:** the founders want people who are not at the court to browse and order from the
  normal website, while diners at a table keep the scan-and-order flow (FR-C1b).
- **Decisions:** `startSession` also takes `{ mode: 'pickup' }`. It needs a signed-in (non-anonymous)
  diner and opens a session with `tableId: 'pickup'`, `tableLabel: 'Pickup'` and no `qrToken`, keyed
  `{uid}_pickup_{dateKey}` like table sessions. `createCheckout` re-checks sign-in for pickup
  sessions and refuses them while online payments are off, so nobody can place an unpaid order from
  home. Payment returns to `/order?order_id=…` and order pushes link there too. Kitchens see the
  label "Pickup" where a table label would be; tickets and tokens are unchanged.
- **Load:** the per-day pickup counter (`counters/{dateKey}_pickup`) moves only when a member opens
  their first website session of the day, far below the 1 write/s limit.

## ADR 020: Email accounts and the table welcome sheet
- **Context:** website orders need an account (ADR 019), and not every diner wants to use Google.
  Diners who scan a table should see their choices up front without being forced to sign in.
- **Decisions:** Firebase Email/Password sign-in sits next to Google (both free). Sign-up collects
  name, email, mobile and password and upgrades the anonymous guest in place with
  `linkWithCredential`, so the uid, cart and table session stay; the name and mobile then go
  through `accountAction UPDATE_PROFILE`. Log-in to an existing email account sends the guest's ID
  token to `accountAction SYNC`, which merges the guest's orders exactly as for Google. Password
  reset uses Firebase's email and never says whether an address has an account. The server treats
  any non-anonymous provider as a member, so no function changed.
- **Table welcome:** after a scan, a guest sees one sheet per day with Continue with Google,
  Log in or sign up, and Continue as guest. Members never see it. Perks copy promises nothing that
  does not exist: member-only coupons (`audience: MEMBERS`), offers when shops run them, and loyalty
  points marked "Coming soon".
- **Ops:** the Email/Password provider must be enabled in Firebase Authentication.


## ADR 021: One palette for every app
- **Decision:** customer, kitchen, shop admin, master and landing share the same tokens: Ice Silver
  `#DDE3E8` (canvas), Deep Aubergine `#3A0F34` (text and primary actions), Marigold `#F6A609`
  (accent). Each app's `styles/index.css` holds the same `:root` values; components keep using the
  semantic classes (`bg-ink`, `bg-accent`, `text-accent-ink`).
- **Kept on purpose:** status colours (veg/non-veg, ready green, prep amber, danger red), each
  shop's own brand colour in the 3D court, and the banknote/coin colours on the shop admin login,
  which depict real rupees.

## ADR 022: Market Hall design system, Earthy Minimal palette, protected 3D landing
- **Supersedes ADR 021's palette.** Customer, kitchen, shop admin and master import
  `packages/design/tokens.css`: Warm Canvas, Stone, White, Charcoal, Terracotta, Sage, Muted Olive,
  Warm Gray, Soft Border, Error, plus motion durations (`--dur-fast/base/slow`, zeroed under reduced
  motion) and stall colours. Display face: Bricolage Grotesque (self-hosted via fontsource, `font-display`
  class / Tailwind `font-display`); interface: Geist; tokens and money: Geist Mono / tabular numerals.
- **Contrast rules:** Warm Gray and Sage fail AA for small text, so secondary text uses `--ink-3`
  (5:1) and Sage is decorative only. White on Terracotta passes AA (4.7:1). Kitchen states are
  Terracotta (New), Charcoal (Cooking), Olive (Ready), each also labelled and iconed.
- **Protected:** `apps/landing/**` stays byte-identical to the deployed commit `3dac67d`, and
  `packages/ui/**` (the kit and Tailwind preset the landing compiles) is not changed by the redesign.
  Check: `git diff 3dac67d -- apps/landing` is empty and a landing build produces the same asset hashes.
  New design work goes in `packages/design` or app folders, never in those paths.
- **Update (same day): one landing page.** The diner site's marketing home is merged into the landing
  app: the landing page gains an "Order online" section (pickup steps, member perks) and its ordering
  CTAs now go to the diner site; the diner site opens straight on the shop stalls with an "About the
  court" link back. The landing UI uses the shared tokens and Market Hall type. What stays protected
  is the 3D view: `apps/landing/src/scene/**` and the 3D canvas setup in `Hero.tsx` are unchanged
  from `3dac67d` (`git diff 3dac67d -- apps/landing/src/scene` is empty). The kit's BrandMark,
  StaffLogin and Sheet now use the display face and a flat Charcoal mark.


## ADR 023: Adding shops from menu files

Sweet Cravings, Basil and Yash Fruit Juice & Icecream Corner joined Roll Me and Siddi Vinayaka Garden.

- **Menus are files.** Each shop's menu lives in `docs/menus/<shop>.json` and `functions/test/menus.test.ts` checks every file the way the shop-admin screen would (unique ids, whole-rupee prices within limits, name and size caps). A shop is loaded with create-only writes, never by re-running `seed.ts`, which also resets the global config and regenerates every table QR.
- **One price per dish.** The menu model has no size options, so a dish sold in two sizes is two dishes, `Mint Lemonade (Lite)` and `(Regular)`, and Sweet Cravings' half-kilo and one-kilo cakes are separate dishes next to each other. Extras the model cannot price (eggless, custom design) are said in the dish description.
- **Five shops no longer fit as one pill.** The customer shop switcher keeps the sliding pill up to three shops and becomes a sideways-scrolling row of chips beyond that. Shops are sorted by name everywhere, including the customer's REST loader.
- **The platform charge on the new shops is ₹1 per order and no percentage** (`feePct: 0`, `perOrderFeePaise: 100`). Every shop runs 07:00-21:00. Roll Me and Siddi Vinayaka Garden still carry the older 3% plus ₹1 in production.


## ADR 024: Cost control, the cached catalogue and the billing guard

The product has to cost close to nothing to run. Firebase bills operations (reads, writes, function calls), so the
design rule is: **cost follows orders, never visitors or open tabs.** Full numbers and the runbook are in
`docs/cost-control.md`; the failure scenarios are in `docs/worst-cases.md`.

- **The diner's catalogue is a cached copy, not a database read.** `functions/src/catalog.ts` keeps two documents
  in `publicCatalog` (heavy `data`: shops and menus; light `status`: stock, pauses, flags) current with one small
  write per change. The customer site's Hosting CDN serves them at `/api/status` (15 s) and `/api/catalog?v=<version>`
  (a day, because the URL changes with the content). A phone checks the small status about every 90 seconds and
  fetches the catalogue only when its version moves. Local development still reads Firestore directly.
- **Public reads are closed.** `vendors`, `menus`, `availability`, `config` and `venues` are readable by staff only,
  scoped to their own shop; `publicCatalog` is server-only. Every public read would have been billed to the project.
- **No polling and no hidden listeners.** Admin Home refreshes every 5 minutes while visible; manager and shop-admin
  listeners pause in a background tab; staff apps keep a persistent browser cache. Kitchens stay live.
- **Background work is idle-cheap.** The sweeper runs 06:00 to 21:59 IST, does one query when nothing is waiting, and
  asks Cashfree about an unpaid order at fixed ages (2, 3, 5, 8, 12, 16, 21, 26 minutes) instead of every minute.
- **The shared rate limiter is for money.** It costs a read and a write per call, so only `createCheckout` and a few
  low-volume actions use it; session start, kitchen actions and staff reports use the in-memory limiter.
- **Write only what changed.** The order's overall status is re-derived only after Collected, Reject and Cancel,
  the only kitchen steps that can change it, and is written only when it differs.
- **A hard cap exists but is off.** `billingGuard` unlinks billing when a budget alert reaches 100% (the project then
  stops until billing is linked again). It is deployed with `KILL_SWITCH_ENABLED=false` until a budget is chosen.
- **Honest limit.** At about 60 reads and 16 writes per order the free quota covers roughly 620 to 750 orders a day;
  beyond that the bill grows by about ₹85 a month per extra 1,000 orders a day. Moving the live ticket stream to
  Realtime Database (billed by data, not operation) is the next step if volume makes that matter.
