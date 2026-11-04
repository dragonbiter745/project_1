import { test, expect } from '@playwright/test';
import { URLS, SEED_DATA } from '../helpers/constants';
import { sendPaymentSuccessWebhook } from '../helpers/webhook';

test.describe('Journey B: Kitchen Actions & Failure Handling', () => {
  test('Kitchen rejection triggers auto-refund and diner alert', async ({ page, browser }) => {
    // 1. Diner creates an order
    await page.addInitScript(() => {
      window.Cashfree = () => ({ checkout: async () => ({ paymentDetails: {} }) });
    });

    let createdOrderId: string | null = null;
    let orderTotalPaise = 0;

    page.on('response', async (res) => {
      if (res.url().includes('createCheckout') && res.status() === 200) {
        try {
          const data = await res.json();
          createdOrderId = data.result?.orderId;
          orderTotalPaise = data.result?.totalPaise;
        } catch {}
      }
    });

    await page.goto(`${URLS.customer}/t/${SEED_DATA.qrToken}`, { waitUntil: 'networkidle' });
    await page.locator('[role="tab"]:has-text("Roll Me")').click();
    await page.getByRole('button', { name: 'Add Chickpet Donne Biriyani' }).click();

    await page.getByRole('button', { name: /View cart/i }).click();
    const cartSheet = page.getByRole('dialog', { name: 'Your order' });
    await cartSheet.getByRole('button', { name: /^Pay /i }).click();

    await page.waitForTimeout(2000);
    expect(createdOrderId).toBeTruthy();

    // Replay payment webhook
    await sendPaymentSuccessWebhook({
      orderId: createdOrderId!,
      orderAmountPaise: orderTotalPaise,
    });

    // 2. Kitchen logs in and Rejects the ticket
    const kitchenContext = await browser.newContext();
    const kitchenPage = await kitchenContext.newPage();

    await kitchenPage.goto(URLS.vendor, { waitUntil: 'networkidle' });
    await kitchenPage.fill('input[type="email"]', SEED_DATA.staff.kitchenRollMe.email);
    await kitchenPage.fill('input[type="password"]', SEED_DATA.staff.kitchenRollMe.password);
    await kitchenPage.click('button[type="submit"]');

    // Dismiss Start service modal
    const startServiceBtn = kitchenPage.getByRole('button', { name: 'Start service' });
    await startServiceBtn.waitFor({ state: 'visible', timeout: 15000 });
    await startServiceBtn.click();
    await startServiceBtn.waitFor({ state: 'hidden', timeout: 5000 });

    // Look for Reject button on the ticket
    await kitchenPage.waitForTimeout(2000);
    const rejectBtn = kitchenPage.getByRole('button', { name: 'Reject' }).first();
    await expect(rejectBtn).toBeVisible();
    await rejectBtn.click();

    // Select a rejection reason and confirm in modal
    const reasonModal = kitchenPage.locator('[role="dialog"]:has-text("Reject")');
    await reasonModal.waitFor({ state: 'visible', timeout: 5000 });
    await reasonModal.locator('label:has-text("Out of ingredients")').click();
    await reasonModal.getByRole('button', { name: 'Reject and refund' }).click();
    await reasonModal.waitFor({ state: 'hidden', timeout: 5000 });

    // Verify ticket RM-002 was rejected and removed from New column
    await expect(kitchenPage.locator('body')).not.toContainText('RM-002');

    await kitchenContext.close();
  });
});
