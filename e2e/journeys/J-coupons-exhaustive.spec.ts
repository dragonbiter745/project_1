import { test, expect } from '@playwright/test';
import { URLS, SEED_DATA } from '../helpers/constants';
import { sendPaymentSuccessWebhook } from '../helpers/webhook';
import { razorpayMock } from '../helpers/razorpayMock';

test.describe('Journey J: Exhaustive Coupons Suite (Browser E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(razorpayMock);
  });

  test('Valid Flat & Percentage Coupons calculate correct integer paise discounts', async ({ page }) => {
    await page.goto(`${URLS.customer}/t/${SEED_DATA.qrToken}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('Table T-14');

    // Add Donne Biriyani (₹149) from Roll Me
    await page.locator('[role="tab"]:has-text("Roll Me")').click();
    await page.locator('li:has-text("Chickpet Donne Biriyani"):not(:has-text("Combo"))').first().getByRole('button', { name: /Add/i }).click();

    // Open Cart
    await page.getByRole('button', { name: /View cart/i }).click();
    const cartSheet = page.getByRole('dialog', { name: 'Your order' });
    await expect(cartSheet).toBeVisible();

    // 1. Test FLAT50
    await cartSheet.getByText('Apply a coupon').click();
    const couponSheet = page.getByRole('dialog', { name: 'Coupons' });
    await expect(couponSheet).toBeVisible();

    await couponSheet.getByPlaceholder('Enter a code').fill('FLAT50');
    await couponSheet.locator('form').getByRole('button', { name: 'Apply' }).click();

    // Verify FLAT50 applies ₹50 off: ₹149 - ₹50 = ₹99
    await expect(page.locator('body')).toContainText('FLAT50 applied');
    await expect(cartSheet).toContainText('Coupon FLAT50');
    await expect(cartSheet).toContainText('You save ₹50');
    await expect(cartSheet.getByRole('button', { name: /^Pay /i })).toContainText('₹99');

    // 2. Switch to PERCENT10 (10% of ₹149 = ₹14.90 off -> ₹134.10)
    // Remove FLAT50 first
    await cartSheet.getByRole('button', { name: /Remove coupon FLAT50/i }).click();
    await expect(cartSheet).not.toContainText('Coupon FLAT50');

    await cartSheet.getByText('Apply a coupon').click();
    await expect(couponSheet).toBeVisible();
    await couponSheet.getByPlaceholder('Enter a code').fill('PERCENT10');
    await couponSheet.locator('form').getByRole('button', { name: 'Apply' }).click();

    await expect(page.locator('body')).toContainText('PERCENT10 applied');
    await expect(cartSheet).toContainText('Coupon PERCENT10');
    await expect(cartSheet).toContainText('You save ₹14.90');
    await expect(cartSheet.getByRole('button', { name: /^Pay /i })).toContainText('₹134.10');
  });

  test('Rejection of invalid, expired, maxed, and threshold coupons', async ({ page }) => {
    await page.goto(`${URLS.customer}/t/${SEED_DATA.qrToken}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('Table T-14');

    // Add Donne Biriyani (₹149)
    await page.locator('[role="tab"]:has-text("Roll Me")').click();
    await page.locator('li:has-text("Chickpet Donne Biriyani"):not(:has-text("Combo"))').first().getByRole('button', { name: /Add/i }).click();

    await page.getByRole('button', { name: /View cart/i }).click();
    const cartSheet = page.getByRole('dialog', { name: 'Your order' });
    await cartSheet.getByText('Apply a coupon').click();
    const couponSheet = page.getByRole('dialog', { name: 'Coupons' });

    // 1. EXPIRED coupon
    await couponSheet.getByPlaceholder('Enter a code').fill('EXPIRED');
    await couponSheet.locator('form').getByRole('button', { name: 'Apply' }).click();
    await expect(couponSheet.getByRole('alert')).toContainText('This coupon has expired.');

    // 2. MAXED coupon (totalLimit reached)
    await couponSheet.getByPlaceholder('Enter a code').fill('MAXED');
    await couponSheet.locator('form').getByRole('button', { name: 'Apply' }).click();
    await expect(couponSheet.getByRole('alert')).toContainText('This coupon has been fully used.');

    // 3. MIN500 coupon (cart is ₹149, requires ₹500 -> shortage ₹351)
    await couponSheet.getByPlaceholder('Enter a code').fill('MIN500');
    await couponSheet.locator('form').getByRole('button', { name: 'Apply' }).click();
    // Closes coupon sheet and notifies on cart
    await expect(page.locator('body')).toContainText('Add ₹351 more of eligible dishes to use this coupon.');

    // Remove MIN500 before clearing cart
    const removeCouponBtn = cartSheet.getByRole('button', { name: /Remove coupon/i });
    if (await removeCouponBtn.isVisible({ timeout: 3000 })) {
      await removeCouponBtn.click();
    }

    // Clear cart and browse menu
    await cartSheet.getByRole('button', { name: 'Clear cart' }).click();
    await cartSheet.getByRole('button', { name: 'Browse menu' }).click();

    // 4. ROLLMEONLY coupon on Siddi Vinayaka items
    await page.locator('[role="tab"]:has-text("Siddi Vinayaka")').click();
    await page.getByRole('button', { name: 'Add Idly Vada' }).first().click();

    await page.getByRole('button', { name: /View cart/i }).click();
    await cartSheet.getByText('Apply a coupon').click();
    await couponSheet.getByPlaceholder('Enter a code').fill('ROLLMEONLY');
    await couponSheet.locator('form').getByRole('button', { name: 'Apply' }).click();

    await expect(page.locator('body')).toContainText('This coupon is for dishes from other shops.');
  });

  test('Single-use coupon enforcement (ONCEPERDINER) prevents reuse', async ({ page }) => {
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

    await page.goto(`${URLS.customer}/t/${SEED_DATA.qrToken}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('Table T-14');

    // Add Donne Biriyani (₹149)
    await page.locator('[role="tab"]:has-text("Roll Me")').click();
    await page.locator('li:has-text("Chickpet Donne Biriyani"):not(:has-text("Combo"))').first().getByRole('button', { name: /Add/i }).click();

    // Apply ONCEPERDINER
    await page.getByRole('button', { name: /View cart/i }).click();
    const cartSheet = page.getByRole('dialog', { name: 'Your order' });
    await cartSheet.getByText('Apply a coupon').click();

    const couponSheet = page.getByRole('dialog', { name: 'Coupons' });
    await couponSheet.getByPlaceholder('Enter a code').fill('ONCEPERDINER');
    await couponSheet.locator('form').getByRole('button', { name: 'Apply' }).click();

    await expect(page.locator('body')).toContainText('ONCEPERDINER applied');
    // ONCEPERDINER takes flat ₹20 off: ₹149 - ₹20 = ₹129
    await expect(cartSheet.getByRole('button', { name: /^Pay /i })).toContainText('₹129');

    // Complete Checkout & Pay
    await cartSheet.getByRole('button', { name: /^Pay /i }).click();
    await page.waitForTimeout(2000);
    expect(createdOrderId).toBeTruthy();

    // Send successful payment webhook
    await sendPaymentSuccessWebhook({
      orderId: createdOrderId!,
      orderAmountPaise: orderTotalPaise,
    });

    // Wait for payment confirmation
    await page.waitForTimeout(2000);

    // Return to the table menu for the second order
    await page.goto(`${URLS.customer}/t/${SEED_DATA.qrToken}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('Table T-14');

    // Add another item from Roll Me
    await page.locator('[role="tab"]:has-text("Roll Me")').click();
    await page.locator('li:has-text("Chickpet Donne Biriyani"):not(:has-text("Combo"))').first().getByRole('button', { name: /Add/i }).click();

    // Try applying ONCEPERDINER again
    await page.getByRole('button', { name: /View cart/i }).click();
    await cartSheet.getByText('Apply a coupon').click();
    await couponSheet.getByPlaceholder('Enter a code').fill('ONCEPERDINER');
    await couponSheet.locator('form').getByRole('button', { name: 'Apply' }).click();

    // Assert rejection due to single-use limit
    await expect(couponSheet.getByRole('alert')).toContainText("You've already used this coupon.");
  });

  test('Server strictly guards against client-side faked discounts & tampering', async ({ page }) => {
    await page.goto(`${URLS.customer}/t/${SEED_DATA.qrToken}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('Table T-14');

    // Attempt direct tampering: invoke createCheckout with an invalid/fake coupon code via browser fetch
    const response = await page.evaluate(async () => {
      const res = await fetch('http://127.0.0.1:5001/demo-foodcourt/asia-south1/createCheckout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            sessionId: 'invalid_sess_123',
            checkoutKey: 'tamper_key_999',
            items: [
              {
                id: 'item_fake_1',
                vendorId: 'vendor-roll-me',
                name: 'Biriyani',
                pricePaise: 1, // client attempting to pay 1 paise!
                qty: 1,
              },
            ],
            couponCode: 'NONEXISTENT_FREE_FOOD',
          },
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    // Server must reject: unauthenticated or invalid session / coupon
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(response.body)).toMatch(/UNAUTHENTICATED|NOT_FOUND|FAILED_PRECONDITION|INVALID_ARGUMENT/i);
  });
});
