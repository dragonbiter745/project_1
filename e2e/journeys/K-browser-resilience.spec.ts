import { test, expect } from '@playwright/test';
import { URLS, SEED_DATA } from '../helpers/constants';
import { sendPaymentSuccessWebhook } from '../helpers/webhook';

test.describe('Journey K: Real Browser Resilience Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.Cashfree = () => ({ checkout: async () => ({ paymentDetails: {} }) });
    });
  });

  test('Double-tapping Pay button disables immediately and creates exactly ONE order', async ({ page }) => {
    const checkoutCalls: any[] = [];
    let createdOrderId: string | null = null;
    let orderTotalPaise = 14900;

    page.on('response', async (res) => {
      if (res.url().includes('createCheckout')) {
        checkoutCalls.push(res);
        if (res.status() === 200) {
          try {
            const data = await res.json();
            createdOrderId = data.result?.orderId;
            orderTotalPaise = data.result?.totalPaise ?? 14900;
          } catch {}
        }
      }
    });

    await page.goto(`${URLS.customer}/t/${SEED_DATA.qrToken}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('Table T-14', { timeout: 20000 });

    // Add Donne Biriyani (₹149)
    await page.locator('[role="tab"]:has-text("Roll Me")').click();
    await page.locator('li:has-text("Chickpet Donne Biriyani"):not(:has-text("Combo"))').first().getByRole('button', { name: /Add/i }).click();

    await page.getByRole('button', { name: /View cart/i }).click();
    const cartSheet = page.getByRole('dialog', { name: 'Your order' });
    await expect(cartSheet).toBeVisible();

    const payBtn = cartSheet.getByRole('button', { name: /^Pay /i });
    await expect(payBtn).toBeVisible();

    // Rapid double click on Pay button
    await payBtn.dblclick();

    // Verify Pay button is immediately disabled/loading to prevent duplicate clicks
    await expect(payBtn).toBeDisabled();

    await page.waitForTimeout(2500);
    expect(createdOrderId).toBeTruthy();

    // Verify only 1 successful checkout response was processed
    const successfulCheckouts = checkoutCalls.filter((c) => c.status() === 200);
    expect(successfulCheckouts.length).toBe(1);

    // Complete the payment via webhook
    await sendPaymentSuccessWebhook({
      orderId: createdOrderId!,
      orderAmountPaise: orderTotalPaise,
    });

    // Tracking sheet appears with exactly 1 order
    const trackingDialog = page.getByRole('dialog', { name: /Order #/i });
    await expect(trackingDialog).toBeVisible({ timeout: 10000 });
    await expect(trackingDialog).toContainText('Chickpet Donne Biriyani');
  });

  test('Closing tab or page reload preserves cart items and table session', async ({ page }) => {
    await page.goto(`${URLS.customer}/t/${SEED_DATA.qrToken}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('Table T-14', { timeout: 20000 });

    // Add Donne Biriyani from Roll Me
    await page.locator('[role="tab"]:has-text("Roll Me")').click();
    await page.locator('li:has-text("Chickpet Donne Biriyani"):not(:has-text("Combo"))').first().getByRole('button', { name: /Add/i }).click();

    // Add Idly Vada from Siddi Vinayaka
    await page.locator('[role="tab"]:has-text("Siddi Vinayaka")').click();
    await page.getByRole('button', { name: 'Add Idly Vada' }).first().click();

    // Verify cart has 2 items before reload
    const viewCartBtn = page.getByRole('button', { name: /View cart/i });
    await expect(viewCartBtn).toContainText('2 items');

    // Simulate diner closing the tab and reopening the table link
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Assert table session is immediately restored
    await expect(page.locator('body')).toContainText('Table T-14');

    // Assert cart state is preserved after reload (2 items, correct price)
    await expect(viewCartBtn).toBeVisible();
    await expect(viewCartBtn).toContainText('2 items');

    // Open cart and assert both items and total are intact
    await viewCartBtn.click();
    const cartSheet = page.getByRole('dialog', { name: 'Your order' });
    await expect(cartSheet).toBeVisible();
    await expect(cartSheet).toContainText('Chickpet Donne Biriyani');
    await expect(cartSheet).toContainText('Idly Vada');

    // Donne Biriyani (₹149) + Idly Vada (₹55) + multi-vendor convenience fee (₹10) = ₹214
    await expect(cartSheet.getByRole('button', { name: /^Pay /i })).toContainText('₹214');
  });

  test('Page reload during active order restores order tracking and status', async ({ page }) => {
    let createdOrderId: string | null = null;
    let orderTotalPaise = 14900;

    page.on('response', async (res) => {
      if (res.url().includes('createCheckout') && res.status() === 200) {
        try {
          const data = await res.json();
          createdOrderId = data.result?.orderId;
          orderTotalPaise = data.result?.totalPaise ?? 14900;
        } catch {}
      }
    });

    await page.goto(`${URLS.customer}/t/${SEED_DATA.qrToken}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('Table T-14', { timeout: 20000 });

    // Add Donne Biriyani
    await page.locator('[role="tab"]:has-text("Roll Me")').click();
    await page.locator('li:has-text("Chickpet Donne Biriyani"):not(:has-text("Combo"))').first().getByRole('button', { name: /Add/i }).click();

    await page.getByRole('button', { name: /View cart/i }).click();
    const cartSheet = page.getByRole('dialog', { name: 'Your order' });
    await cartSheet.getByRole('button', { name: /^Pay /i }).click();

    await page.waitForTimeout(2000);
    expect(createdOrderId).toBeTruthy();

    await sendPaymentSuccessWebhook({
      orderId: createdOrderId!,
      orderAmountPaise: orderTotalPaise,
    });

    // Tracking sheet opens
    const trackingDialog = page.getByRole('dialog', { name: /Order #/i });
    await expect(trackingDialog).toBeVisible({ timeout: 10000 });

    // Reload the page while order is active
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('Table T-14');

    // Active order tracking bar is restored from Firestore
    const trackBtn = page.locator('.float-bar').getByRole('button', { name: /Track|Order in progress/i });
    await expect(trackBtn).toBeVisible({ timeout: 15000 });

    // Clicking Track reopens Tracking Sheet with active ticket details
    await trackBtn.click();
    const trackingDialogAfterReload = page.getByRole('dialog', { name: /Order #/i });
    await expect(trackingDialogAfterReload).toBeVisible({ timeout: 10000 });
    await expect(trackingDialogAfterReload).toContainText('Chickpet Donne Biriyani');
  });
});
