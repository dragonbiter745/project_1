# Cloud Burst Test Plan: 1,500–2,000 Diners Peak Simulation

> [!IMPORTANT]
> **SAFETY & COMPLIANCE MANDATE**
> - **DO NOT run against production project `reva-nest-foodcourt` or live domains under any circumstances.**
> - All load testing on cloud infrastructure MUST be executed in an isolated, throwaway Firebase project (e.g. `qrave-loadtest-throwaway`).
> - Requires explicit user confirmation and budget limits before executing.

---

## 1. Objectives & Target Scenarios
- **Objective:** Verify system stability, latency, data integrity, and Firestore contention under peak university/food-court lunch rush:
  - **1,500 to 2,000 active diners** browsing the menu over a 30-minute lunch peak window.
  - **Peak checkout rate:** 20 to 30 concurrent checkouts/second across 5 food-court vendors.
  - **Counter contention:** Validate `reserveTokens()` and `retryContention()` under simultaneous ticket generation for the same shop counters.
  - **Target Latency SLAs:**
    - Catalogue reads (CDN): `< 50ms` (cached at Firebase Hosting Edge).
    - `createCheckout` callable function: p50 `< 80ms`, p95 `< 250ms`.
    - Payment Webhook (`razorpayWebhook`): p50 `< 90ms`, p95 `< 300ms`.
    - Real-time KDS delivery: `< 1.5s` from webhook ACK to tablet receipt.

---

## 2. Infrastructure Setup (Throwaway Project)

### Step 1: Create Disposable Project
```bash
# Set up a new isolated Google Cloud / Firebase project
gcloud projects create qrave-loadtest-throwaway --name="Qrave Load Testing"
firebase use --add qrave-loadtest-throwaway

# Link billing account with a strict $10 threshold alert
gcloud beta billing projects link qrave-loadtest-throwaway --billing-account=<BILLING_ACCOUNT_ID>
```

### Step 2: Configure Environment & Secrets
```bash
# asia-south1 Cloud Functions region
firebase functions:config:set \
  app.env="staging" \
  razorpay.key_id="<rzp_test_KEY_ID>" \
  razorpay.webhook_secret="<TEST_WEBHOOK_SECRET>" \
```

### Step 3: Deploy Backend & Rules Only
```bash
# Deploy Firestore security rules and Cloud Functions
firebase deploy --only firestore:rules,functions --project qrave-loadtest-throwaway
```

### Step 4: Seed Throwaway Environment
```bash
# Seed 5 vendors, tables 1-155, 7 coupon types, and precomputed catalog
PROJECT_ID=qrave-loadtest-throwaway pnpm seed
```

---

## 3. Load Generation Strategy & Tooling (k6)

### Traffic Model
- **Stage 1 (Warmup - 2 min):** 100 virtual users (VUs) browsing catalogue and warming Cloud Function instances.
- **Stage 2 (Ramp-up - 5 min):** Scale from 100 to 1,500 VUs.
- **Stage 3 (Peak Rush - 15 min):** 1,500–2,000 VUs continuously browsing; 20–30 orders/sec submitted.
- **Stage 4 (Cooldown - 5 min):** Drop back to 100 VUs and verify reconciliation & sweeper jobs.

### k6 Script Architecture (`load-rush.js`)
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import crypto from 'k6/crypto';

export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 1500 },
    { duration: '15m', target: 2000 },
    { duration: '5m', target: 100 },
    { duration: '3m', target: 0 },
  ],
  thresholds: {
    'http_req_duration{type:checkout}': ['p(95)<300'],
    'http_req_duration{type:webhook}': ['p(95)<350'],
    'http_req_failed': ['rate<0.01'], // < 1% errors
  },
};

export default function () {
  // 1. Fetch CDN catalogue status & catalog data (95% cache hit rate)
  const catRes = http.get('https://<project-hosting-url>/api/catalog?v=current', {
    tags: { type: 'catalog' },
  });
  check(catRes, { 'catalog 200': (r) => r.status === 200 });

  // 2. 20% of sessions create checkout (300-400 orders per burst)
  if (Math.random() < 0.2) {
    const checkoutPayload = JSON.stringify({
      data: {
        tableToken: 'Q7xk2PqM9vR4tLw8nB3ydA',
        items: [
          { vendorId: 'vendor-roll-me', itemId: 'rm-roll-paneer', quantity: 1, basePricePaise: 18000 },
        ],
        appliedCoupon: null,
      },
    });

    const chkRes = http.post('https://asia-south1-qrave-loadtest-throwaway.cloudfunctions.net/createCheckout', checkoutPayload, {
      headers: { 'Content-Type': 'application/json' },
      tags: { type: 'checkout' },
    });
    check(chkRes, { 'checkout 200': (r) => r.status === 200 });

    if (chkRes.status === 200) {
      const order = JSON.parse(chkRes.body).result;
      
      // 3. Replay signed Razorpay webhook for payment confirmation
      const rawBody = JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: `pay_${Date.now()}`, order_id: order.razorpayOrderId, amount: 18000, currency: 'INR', status: 'captured', method: 'upi' } } },
      });
      const signature = crypto.hmac('sha256', '<TEST_WEBHOOK_SECRET>', rawBody, 'hex');

      const hookRes = http.post('https://asia-south1-qrave-loadtest-throwaway.cloudfunctions.net/razorpayWebhook', rawBody, {
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': signature,
        },
        tags: { type: 'webhook' },
      });
      check(hookRes, { 'webhook 200': (r) => r.status === 200 });
    }
  }

  sleep(Math.random() * 3 + 2); // 2-5 seconds dwell time
}
```

---

## 4. Key Metrics & Monitoring Dashboard

1. **Cloud Functions Concurrency & Cold Starts:**
   - GCP Metrics Explorer: `cloudfunctions.googleapis.com/function/execution_count`
   - Active instances: Target `max_instances: 50` for `createCheckout` and `razorpayWebhook`.
2. **Firestore Lock Contention on Daily Counters:**
   - Measure document transaction retry rate on `counters/{dateKey}_{vendorId}`.
   - Confirm `retryContention()` in `functions/src/lib/orders.ts` keeps token allocation 100% collision-free.
3. **Budget Guard & Billing:**
   - Confirm billing alert triggers at $5 threshold.
   - Verify `billingGuard` killSwitch behavior if budget trip wire is tested.

---

## 5. Teardown & Project Deletion

Immediately after the load test completes and metrics are captured:
```bash
# 1. Unlink billing account to prevent further billing
gcloud beta billing projects unlink qrave-loadtest-throwaway

# 2. Shut down and delete throwaway project completely
gcloud projects delete qrave-loadtest-throwaway --quiet
```

