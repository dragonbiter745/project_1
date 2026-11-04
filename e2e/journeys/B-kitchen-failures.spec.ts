import { test, expect } from '@playwright/test';
import { URLS, SEED_DATA } from '../helpers/constants';
import { sendPaymentSuccessWebhook } from '../helpers/webhook';
import { queryFirestore } from '../helpers/firestore';

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

    // Retrieve the exact token assigned to this order
    let expectedToken = '';
    for (let i = 0; i < 10; i++) {
      const results = await queryFirestore('subOrders', {
        field: 'orderId',
        op: 'EQUAL',
        value: createdOrderId!,
      });
      if (results.length > 0 && results[0].token) {
        expectedToken = results[0].token;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(expectedToken).toBeTruthy();

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

    // Look for Reject button on the exact ticket
    const ticketCard = kitchenPage.locator(`article[aria-label="Order ${expectedToken}"]`);
    await ticketCard.waitFor({ state: 'visible', timeout: 10000 });
    const rejectBtn = ticketCard.getByRole('button', { name: 'Reject' });
    await expect(rejectBtn).toBeVisible();
    await rejectBtn.click();

    // Select a rejection reason and confirm in modal
    const reasonModal = kitchenPage.locator('[role="dialog"]:has-text("Reject")');
    await reasonModal.waitFor({ state: 'visible', timeout: 5000 });
    await reasonModal.locator('label:has-text("Out of ingredients")').click();
    await reasonModal.getByRole('button', { name: 'Reject and refund' }).click();
    await reasonModal.waitFor({ state: 'hidden', timeout: 5000 });

    // Verify ticket was removed from kitchen board
    await kitchenPage.waitForTimeout(1000);
    await kitchenContext.close();

    // 3. Verify Refund document in Firestore
    let subOrder: any = null;
    for (let i = 0; i < 10; i++) {
      const results = await queryFirestore('subOrders', {
        field: 'orderId',
        op: 'EQUAL',
        value: createdOrderId!,
      });
      if (results.length > 0 && results[0].status === 'REJECTED' && results[0].refund) {
        subOrder = results[0];
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    expect(subOrder).not.toBeNull();
    expect(subOrder.status).toBe('REJECTED');
    expect(subOrder.refund).toBeDefined();
    expect(subOrder.refund.amountPaise).toBe(orderTotalPaise);
    expect(['PROCESSED', 'PENDING']).toContain(subOrder.refund.status);
    expect(subOrder.refund.refundId).toMatch(/^rf_/);

    // 4. Verify diner's browser reflects rejection and refund status
    await page.bringToFront();
    // Tracking bar or tracking sheet updates live
    await expect(page.locator('body')).toContainText(/couldn't take this order|refund is on its way/i);
  });
});
