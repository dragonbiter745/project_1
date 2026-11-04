import { test, expect } from '@playwright/test';
import { URLS, SEED_DATA } from '../helpers/constants';
import { sendPaymentSuccessWebhook } from '../helpers/webhook';

test.describe('Journey L: Multi-User Browser Swarm (20 Concurrent Diners)', () => {
  test('20 concurrent browser contexts on Table 14 order, apply coupons, and checkout with zero token collisions', async ({ browser }) => {
    // Increase test timeout for 20 concurrent browser tabs
    test.setTimeout(120_000);

    const SWARM_SIZE = 20;
    const diners = Array.from({ length: SWARM_SIZE }, (_, i) => ({ id: i + 1 }));

    console.log(`Spinning up ${SWARM_SIZE} concurrent browser diners on Table 14...`);

    const results = await Promise.all(
      diners.map(async (diner) => {
        // Natural arrival stagger (150ms per diner) across the table
        await new Promise((r) => setTimeout(r, (diner.id - 1) * 150));

        const context = await browser.newContext();
        const page = await context.newPage();

        await page.addInitScript(() => {
          window.Cashfree = () => ({ checkout: async () => ({ paymentDetails: {} }) });
        });

        let createdOrderId: string | null = null;
        let totalPaise = 0;

        page.on('response', async (res) => {
          if (res.url().includes('createCheckout') && res.status() === 200) {
            try {
              const data = await res.json();
              createdOrderId = data.result?.orderId;
              totalPaise = data.result?.totalPaise ?? 0;
            } catch {}
          }
        });

        try {
          // Open Table 14
          await page.goto(`${URLS.customer}/t/${SEED_DATA.qrToken}`, { waitUntil: 'domcontentloaded' });
          await expect(page.locator('body')).toContainText('Table T-14', { timeout: 30000 });

          // Add Donne Biriyani (₹149) from Roll Me
          await page.locator('[role="tab"]:has-text("Roll Me")').click();
          await page
            .locator('li:has-text("Chickpet Donne Biriyani"):not(:has-text("Combo"))')
            .first()
            .getByRole('button', { name: /Add/i })
            .click();

          // Open cart & Apply PERCENT10 coupon
          await page.getByRole('button', { name: /View cart/i }).click();
          const cartSheet = page.getByRole('dialog', { name: 'Your order' });
          await expect(cartSheet).toBeVisible({ timeout: 10000 });

          await cartSheet.getByText('Apply a coupon').click();
          const couponSheet = page.getByRole('dialog', { name: 'Coupons' });
          await couponSheet.getByPlaceholder('Enter a code').fill('PERCENT10');
          await couponSheet.locator('form').getByRole('button', { name: 'Apply' }).click();

          // Verify integer paise discount: ₹149 - 10% (₹14.90) = ₹134.10
          await expect(cartSheet.getByRole('button', { name: /^Pay /i })).toContainText('₹134.10', { timeout: 25000 });

          // Click Pay
          await cartSheet.getByRole('button', { name: /^Pay /i }).click();

          // Wait for orderId to be created
          for (let attempt = 0; attempt < 30; attempt++) {
            if (createdOrderId) break;
            await page.waitForTimeout(500);
          }

          expect(createdOrderId).toBeTruthy();

          return {
            dinerId: diner.id,
            page,
            context,
            orderId: createdOrderId!,
            totalPaise,
          };
        } catch (err) {
          await context.close();
          throw err;
        }
      })
    );

    console.log(`All ${SWARM_SIZE} diners successfully created orders in parallel!`);

    // Verify all orderIds are unique
    const orderIds = results.map((r) => r.orderId);
    expect(new Set(orderIds).size).toBe(SWARM_SIZE);

    // Fire payment success webhooks with a realistic stagger (100ms per diner payment completion)
    for (const r of results) {
      await sendPaymentSuccessWebhook({
        orderId: r.orderId,
        orderAmountPaise: r.totalPaise,
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Wait for all 20 diners' browsers to show tracking confirmation
    await Promise.all(
      results.map(async (r) => {
        const trackingDialog = r.page.getByRole('dialog', { name: /Order #/i });
        await expect(trackingDialog).toBeVisible({ timeout: 25000 });
        await expect(trackingDialog).toContainText('Roll Me', { timeout: 45000 });
        await r.context.close();
      })
    );

    // Verify all 20 token numbers in Firestore are 100% unique
    const tokens: string[] = [];
    for (const orderId of orderIds) {
      const snap = await fetch(`http://127.0.0.1:8080/v1/projects/demo-foodcourt/databases/default/documents/orders/${orderId}`, {
        headers: { Authorization: 'Bearer owner' },
      });
      const orderDoc = await snap.json();
      expect(orderDoc.fields?.status?.stringValue).toBe('PAID');

      // Fetch corresponding subOrder
      const subOrdersSnap = await fetch(
        `http://127.0.0.1:8080/v1/projects/demo-foodcourt/databases/default/documents:runQuery`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
          body: JSON.stringify({
            structuredQuery: {
              from: [{ collectionId: 'subOrders' }],
              where: {
                fieldFilter: {
                  field: { fieldPath: 'orderId' },
                  op: 'EQUAL',
                  value: { stringValue: orderId },
                },
              },
            },
          }),
        }
      );
      const subOrders = await subOrdersSnap.json();
      const token = subOrders[0]?.document?.fields?.token?.stringValue;
      expect(token).toBeTruthy();
      tokens.push(token);
    }

    console.log(`Tokens assigned across 20 concurrent diners:`, tokens);
    // CRITICAL INVARIANT: 20 orders in the same shop must produce 20 completely unique tokens!
    expect(new Set(tokens).size).toBe(SWARM_SIZE);
  });
});
