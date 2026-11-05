import { test, expect } from '@playwright/test';
import { URLS, SEED_DATA } from '../helpers/constants';
import { sendPaymentSuccessWebhook } from '../helpers/webhook';
import { razorpayMock } from '../helpers/razorpayMock';

test.describe('Journey C: Payment Edge Cases & Security', () => {
  test('Webhook security: rejects invalid signature with 401', async () => {
    const res = await sendPaymentSuccessWebhook({
      orderId: 'fake-order-id',
      orderAmountPaise: 10000,
      badSignature: true,
    });
    expect(res.status).toBe(401);
    expect(res.text).toContain('Invalid signature');
  });

  test('Non-INR currency rejected with 400', async ({ page }) => {
    await page.addInitScript(razorpayMock);

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
    const rollMeTab = page.locator('[role="tab"]:has-text("Roll Me")');
    await rollMeTab.waitFor({ state: 'visible', timeout: 15000 });
    await rollMeTab.click();
    await page.getByRole('button', { name: 'Add Chickpet Donne Biriyani' }).click();

    await page.getByRole('button', { name: /View cart/i }).click();
    const cartSheet = page.getByRole('dialog', { name: 'Your order' });
    await cartSheet.getByRole('button', { name: /^Pay /i }).click();

    await page.waitForTimeout(2000);
    expect(createdOrderId).toBeTruthy();

    const res = await sendPaymentSuccessWebhook({
      orderId: createdOrderId!,
      orderAmountPaise: orderTotalPaise,
      currency: 'USD',
    });
    expect(res.status).toBe(400);
    expect(res.text).toContain('Unsupported currency');
  });

  test('Amount mismatch flags order without fulfilling to kitchen', async ({ page, browser }) => {
    await page.addInitScript(razorpayMock);

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
    const rollMeTab = page.locator('[role="tab"]:has-text("Roll Me")');
    await rollMeTab.waitFor({ state: 'visible', timeout: 15000 });
    await rollMeTab.click();
    await page.getByRole('button', { name: 'Add Chickpet Donne Biriyani' }).click();

    await page.getByRole('button', { name: /View cart/i }).click();
    const cartSheet = page.getByRole('dialog', { name: 'Your order' });
    await cartSheet.getByRole('button', { name: /^Pay /i }).click();

    await page.waitForTimeout(2000);
    expect(createdOrderId).toBeTruthy();

    // Diner tries to pay only ₹1.00 (100 paise) instead of full order amount
    const mismatchRes = await sendPaymentSuccessWebhook({
      orderId: createdOrderId!,
      orderAmountPaise: 100, // 100 paise instead of 14900 paise
    });
    expect(mismatchRes.status).toBe(200);
    expect(mismatchRes.json?.outcome).toBe('amount-mismatch');

    // Kitchen should NOT see this flagged ticket
    const kitchenContext = await browser.newContext();
    const kitchenPage = await kitchenContext.newPage();

    await kitchenPage.goto(URLS.vendor, { waitUntil: 'networkidle' });
    await kitchenPage.fill('input[type="email"]', SEED_DATA.staff.kitchenRollMe.email);
    await kitchenPage.fill('input[type="password"]', SEED_DATA.staff.kitchenRollMe.password);
    await kitchenPage.click('button[type="submit"]');

    const startServiceBtn = kitchenPage.getByRole('button', { name: 'Start service' });
    if (await startServiceBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await startServiceBtn.click();
    }

    await kitchenPage.waitForTimeout(2000);
    // Ticket for this flagged order should not exist
    await expect(kitchenPage.locator('body')).not.toContainText(createdOrderId!);

    await kitchenContext.close();
  });

  test('Webhook idempotency: replay returns already and touches nothing', async ({ page }) => {
    await page.addInitScript(razorpayMock);

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
    const rollMeTab = page.locator('[role="tab"]:has-text("Roll Me")');
    await rollMeTab.waitFor({ state: 'visible', timeout: 15000 });
    await rollMeTab.click();
    await page.getByRole('button', { name: 'Add Chickpet Donne Biriyani' }).click();

    await page.getByRole('button', { name: /View cart/i }).click();
    const cartSheet = page.getByRole('dialog', { name: 'Your order' });
    await cartSheet.getByRole('button', { name: /^Pay /i }).click();

    await page.waitForTimeout(2000);
    expect(createdOrderId).toBeTruthy();

    // 1st delivery
    const res1 = await sendPaymentSuccessWebhook({
      orderId: createdOrderId!,
      orderAmountPaise: orderTotalPaise,
    });
    expect(res1.status).toBe(200);
    expect(res1.json?.outcome).toBe('created');

    // 2nd delivery (retry from Razorpay)
    const res2 = await sendPaymentSuccessWebhook({
      orderId: createdOrderId!,
      orderAmountPaise: orderTotalPaise,
    });
    expect(res2.status).toBe(200);
    expect(res2.json?.outcome).toBe('already');
  });
});
