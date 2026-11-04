# End-to-End & Performance Verification Report: Qrave

**Date:** 2026-11-04  
**Environment:** Local Firebase Emulators (`demo-foodcourt`), Cashfree Mock/Sandbox Mode  
**Scope:** Real-browser E2E suite (`pnpm e2e`), High-concurrency Rush load suite (`pnpm e2e:load`), Security Rules verification, Bundle Budget audit, and Resilience verification.

---

## 1. Executive Summary & Verdict

- **Overall Status:** **100% PASSED**
- **Browser Journeys (Playwright):** 16 of 16 tests passed across all applications (`apps/customer`, `apps/vendor`, `apps/master`, `apps/admin`, `apps/landing`).
- **Load Test (Vitest / 60–300 Diners Rush):** 5 of 5 assertions passed.
  - Double-tap idempotency: 100% verified (only 1 order and 1 Cashfree session created).
  - Webhook delivery: 100% of paid orders reached kitchens; lost webhooks recovered via sweeper reconciler.
  - Token numbers: Zero collisions across all shop counters.
  - Zero fraud / amount-mismatched orders fulfilled to kitchen.
- **Security & Cost Control:**
  - Customer JS initial bundle: **124.10 KB gzipped** (well inside the ≤ 150 KB budget).
  - Unauthenticated direct Firestore reads on orders: **DENIED (403)**.
  - Direct client writes to orders, subOrders, or payments: **DENIED (403)**.
  - Catalogue served via precomputed CDN endpoints without unmetered Firestore loops.

---

## 2. Complete Test Matrix

| Journey / Spec | Tests | Status | Duration | Key Validations |
|---|---|---|---|---|
| **Journey A** (`A-diner-first-order.spec.ts`) | 1 | **PASSED** | 16.0s | Real browser scan QR (`T-14`), multi-vendor cart (Roll Me + Siddi Vinayaka), coupon application, signed webhook replay, KDS "Start service" audio onboarding, ticket state machine: `NEW` → `ACCEPTED` → `PREPARING` → `READY` → `COLLECTED`. |
| **Journey B** (`B-kitchen-failures.spec.ts`) | 1 | **PASSED** | 13.6s | Kitchen ticket rejection from KDS (`Out of ingredients`), reason modal selection, removal of ticket card from active board, automatic refund initiation. |
| **Journey C** (`C-payment-edge-cases.spec.ts`) | 4 | **PASSED** | 56.7s | **C.1:** Invalid HMAC signature rejected with 401.<br>**C.2:** Non-INR currency rejected with 400.<br>**C.3:** Amount mismatch triggers `amount-mismatch` status, flags order, and blocks kitchen fulfillment.<br>**C.4:** Webhook replay idempotency returns `already` without mutating state. |
| **Journey D** (`D-shop-owner.spec.ts`) | 2 | **PASSED** | 14.8s | **D.1:** 86ing a dish (Stock toggle switch) updates live customer app in real-time.<br>**D.2:** Shop admin console (:5176) allows finance staff to view daily settlements, order history, and net payout. |
| **Journey E** (`E-venue-admin.spec.ts`) | 1 | **PASSED** | 8.7s | Master venue console (:5175) login, live ops monitoring, table & QR management, coupon creation, and global tax & venue fee controls. |
| **Journey F** (`F-alignment.spec.ts`) | 1 | **PASSED** | 10.9s | Frontend `@foodcourt/shared` calculations match backend `createCheckout` to the exact integer paise (e.g. ₹363.00 = 36,300 paise). |
| **Journey G** (`G-backend-health.spec.ts`) | 3 | **PASSED** | 25ms | **G.1:** Unauthenticated Firestore order reads rejected.<br>**G.2:** Direct client Firestore order writes rejected.<br>**G.3:** Customer app initial JS entrypoint gzipped size = 124.10 KB (≤ 150 KB budget). |
| **Journey H** (`H-pages.spec.ts`) | 3 | **PASSED** | 16.8s | **H.1:** Legal compliance footer links (`Privacy`, `Terms`, `Refunds`, `Cookies`, `Grievance`) present with `target="_blank"`.<br>**H.2:** Invalid QR code route gracefully renders error message and pickup link.<br>**H.3:** Marketing landing site loads cleanly with 0 console/runtime errors. |
| **Load Test** (`rush.test.ts`) | 5 | **PASSED** | ~1m | Rush test simulating double taps, abandoned checkouts, lost webhooks, webhook retries, and normal orders under high contention. |

---

## 3. Bugs Discovered & Resolved

| Component | Bug / Root Cause | Fix Implemented | Verification |
|---|---|---|---|
| **Catalog Dev Proxy** | Vite dev server on customer app received 403 on `/api/catalog` from Cloud Function emulator due to missing CORS headers for local hostnames. | Configured Vite proxy in `apps/customer/vite.config.ts` forwarding `/api` to `http://127.0.0.1:5001/demo-foodcourt/asia-south1/catalog`. | Journey A & H passing; menu loads instantly. |
| **Auth Warning Banner** | Firebase Auth emulator injected a bottom warning iframe that intercepted button clicks in Playwright. | Added `disableWarnings: true` in `connectAuthEmulator` and CSS rule `.firebase-emulator-warning { display: none !important; }`. | Unobstructed pointer interaction across all pages. |
| **Cashfree Sandbox Mocking** | Calling Cashfree API from Cloud Functions emulator failed without outbound internet access or on sandbox mock credentials. | Added sandbox mock helper in `functions/src/lib/cashfree.ts` when running against emulator and `CASHFREE_APP_ID` starts with `TEST_`. | Instant checkout session generation and 0 network failures. |
| **KDS Web Audio Overlay** | Kitchen KDS on `:5174` required user audio interaction gesture (`StartOverlay.tsx`) before opening tickets board. | Updated Playwright tests to detect and dismiss "Start service" overlay prior to manipulating ticket cards. | Journey A & B completed successfully. |
| **KDS Reject Modal Locators** | Rejection modal in `RejectSheet.tsx` used `<label>` wrapped radio inputs instead of native `<button>` elements. | Targeted `label:has-text(...)` followed by confirm rejection button. | Rejection cleanly handled in Journey B. |
| **Invalid Table Pickup Link** | Invalid table code screen rendered an `<a href="/">` anchor rather than a `<button>`. | Updated selector in Journey H to `page.getByRole('link', { name: /Order online for pickup/i })`. | Journey H test 2 passed. |
| **Legal Links Viewport Visibility** | `<nav aria-label="Legal">` was positioned at bottom of scrollable menu container. | Added `.scrollIntoViewIfNeeded()` before asserting visibility. | Journey H test 1 passed. |
| **Database Contamination** | Load test `rush.test.ts` created temporary mock vendors `v-rm` and `v-sv` that leaked into browser tests. | Enforced database wipe via emulator REST API and reseed before browser tests. | Clean 5-vendor catalog preserved. |

---

## 4. Peak Load & Resilience Results

- **Token Allocation Contention:**
  - Daily counters (`counters/{dateKey}_{vendorId}`) handled concurrent allocation with `reserveTokens()` and transaction retries (`retryContention()`).
  - Result: **0 token collisions** across all tickets issued.
- **Double-Tap Idempotency:**
  - Simulating immediate double-taps on the "Pay" button yielded identical `orderId` references with no duplicate Cashfree sessions.
- **Webhook Replay Idempotency:**
  - Duplicate webhook deliveries returned HTTP 200 with `{ outcome: 'already' }` and did not spawn duplicate kitchen sub-orders.
- **Reconciliation Sweeper:**
  - Orders where diner closed the browser before webhook was sent were detected and reconciled by `reconcilePayments()` on subsequent sweeps.
- **Cloud Burst Testing Plan:**
  - Detailed plan documented in [burst-plan.md](file:///Users/dibyabhusal/Developer/qrave/e2e/load/burst-plan.md) specifying k6 test scripts, metrics, and teardown instructions for a throwaway GCP project.

---

## 5. Manual Verification Checklist (Real Device / Production Only)

The following items cannot or must not be tested automatically against emulators and must be verified manually on staging/production hardware:

1. **Web Push (FCM) on Real Physical Phones:**
   - [ ] Diner enables notifications prompt in mobile Chrome/Safari.
   - [ ] Kitchen marks ticket `READY` → confirm real APNs/FCM push notification triggers phone vibration and banner.
   - [ ] Diner toggles off "Order updates" in Account Hub → confirm no notification is delivered.
2. **Thermal Receipt Printer (ESC/POS):**
   - [ ] Kitchen tablet connected to Bluetooth/USB thermal printer.
   - [ ] Paid order arrives → confirm ticket auto-prints with order number, items, and modifiers.
3. **Cashfree Production Gateway:**
   - [ ] Switch `CASHFREE_ENV=PRODUCTION` in Secret Manager.
   - [ ] Perform a real ₹1.00 live transaction via UPI QR / netbanking.
   - [ ] Confirm Cashfree webhook reaches `cashfreeWebhook` endpoint with verified signature.
4. **Billing Guard Activation:**
   - [ ] Verify GCP Cloud Monitoring budget alert triggers `billingGuard` Pub/Sub topic when threshold is exceeded.
