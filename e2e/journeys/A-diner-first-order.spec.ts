import { test, expect } from '@playwright/test';
import { URLS, SEED_DATA } from '../helpers/constants';
import { sendPaymentSuccessWebhook } from '../helpers/webhook';

test.describe('Journey A: Diner First Order (End-to-End)', () => {
  test('Complete diner ordering lifecycle across Roll Me and Siddi Vinayaka', async ({ page, browser }) => {
    // Mock Cashfree checkout modal in browser context
    await page.addInitScript(() => {
      window.Cashfree = () => ({
        checkout: async () => ({ paymentDetails: {} }),
      });
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

    // 1. Scan QR and arrive at table T-14
    await page.goto(`${URLS.customer}/t/${SEED_DATA.qrToken}`, { waitUntil: 'networkidle' });
    await expect(page).toHaveTitle(/Order · Qrave/i);

    // Verify header indicates Table T-14
    await expect(page.locator('body')).toContainText('Table T-14');

    // 2. Verify Legal Links are present
    await expect(page.getByRole('link', { name: /Privacy Policy/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Terms/i })).toBeVisible();

    // 3. Verify out-of-stock item (Chickpet Donne Biriyani Combo) cannot be added
    await page.locator('[role="tab"]:has-text("Roll Me")').first().click();
    const soldOutItem = page.locator('li:has-text("Chickpet Donne Biriyani Combo")');
    await expect(soldOutItem).toContainText('Sold out');
    await expect(soldOutItem.getByRole('button', { name: /Add /i })).toHaveCount(0);

    // 4. Add items from Roll Me
    const biriyaniItem = page.locator('li:has-text("Chickpet Donne Biriyani"):not(:has-text("Combo"))');
    await biriyaniItem.getByRole('button', { name: /Add /i }).click();

    // 5. Add items from Siddi Vinayaka Garden
    await page.locator('[role="tab"]:has-text("Siddi Vinayaka")').first().click();
    const idlyVadaItem = page.locator('li:has-text("Idly Vada")').first();
    await idlyVadaItem.getByRole('button', { name: /Add /i }).click();

    // 6. Open Cart Sheet
    const viewCartBtn = page.getByRole('button', { name: /View cart/i });
    await expect(viewCartBtn).toBeVisible();
    await viewCartBtn.click();

    const cartSheet = page.getByRole('dialog', { name: 'Your order' });
    await expect(cartSheet).toBeVisible();
    await expect(cartSheet).toContainText('Chickpet Donne Biriyani');
    await expect(cartSheet).toContainText('Idly Vada');
    await expect(cartSheet).toContainText('₹214'); // 149 + 65 = 214

    // 7. Test Coupon scenarios
    // 7a. Open coupon sheet
    await page.getByRole('button', { name: /Apply a coupon/i }).click();
    const couponSheet = page.getByRole('dialog', { name: 'Coupons' });
    await expect(couponSheet).toBeVisible();

    // 7b. Try garbage coupon
    await couponSheet.locator('input').fill('GARBAGE99');
    await couponSheet.locator('form').getByRole('button', { name: 'Apply' }).click();
    await expect(couponSheet).toContainText(/No coupon with that code/i);

    // 7c. Apply valid coupon PERCENT10 (10% off on eligible items >= 100)
    await couponSheet.locator('input').fill('PERCENT10');
    await couponSheet.locator('form').getByRole('button', { name: 'Apply' }).click();

    // Verify discount applied in Cart Sheet
    await expect(cartSheet).toContainText('PERCENT10');
    await expect(cartSheet).toContainText('Coupon PERCENT10');

    // 8. Place order (Pay)
    const payBtn = cartSheet.getByRole('button', { name: /^Pay /i });
    await payBtn.click();

    // Wait for createCheckout
    await page.waitForTimeout(2000);
    expect(createdOrderId).toBeTruthy();

    // 9. Send signed Cashfree Webhook
    const webhookRes = await sendPaymentSuccessWebhook({
      orderId: createdOrderId!,
      orderAmountPaise: orderTotalPaise,
    });
    expect(webhookRes.status).toBe(200);
    expect(webhookRes.json?.ok).toBe(true);

    // 10. Verify Kitchen display for Roll Me
    const kitchenContext = await browser.newContext();
    const kitchenPage = await kitchenContext.newPage();

    await kitchenPage.goto(URLS.vendor, { waitUntil: 'networkidle' });
    await kitchenPage.fill('input[type="email"]', SEED_DATA.staff.kitchenRollMe.email);
    await kitchenPage.fill('input[type="password"]', SEED_DATA.staff.kitchenRollMe.password);
    await kitchenPage.click('button[type="submit"]');

    // Dismiss "Start service" modal (enables audio and wake-lock for kitchen board)
    const startServiceBtn = kitchenPage.getByRole('button', { name: 'Start service' });
    await startServiceBtn.waitFor({ state: 'visible', timeout: 15000 });
    await startServiceBtn.click();
    await startServiceBtn.waitFor({ state: 'hidden', timeout: 5000 });

    // Wait for board to load and ticket to appear in New column
    await expect(kitchenPage.locator('body')).toContainText('T-14');
    await expect(kitchenPage.locator('body')).toContainText('RM-001');
    await expect(kitchenPage.locator('body')).toContainText('Chickpet Donne Biriyani');

    // Move status: Accept -> Preparing -> Ready -> Hand over (Collected)
    const acceptBtn = kitchenPage.getByRole('button', { name: 'Accept' }).first();
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();
    await kitchenPage.waitForTimeout(1000);

    const readyBtn = kitchenPage.getByRole('button', { name: /Ready/i }).first();
    if (await readyBtn.isVisible()) {
      await readyBtn.click();
      await kitchenPage.waitForTimeout(1000);
    }

    const handOverBtn = kitchenPage.getByRole('button', { name: /Hand over/i }).first();
    if (await handOverBtn.isVisible()) {
      await handOverBtn.click();
      await kitchenPage.waitForTimeout(1000);
    }

    await kitchenContext.close();
  });
});
