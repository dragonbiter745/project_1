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
