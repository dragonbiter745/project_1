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
