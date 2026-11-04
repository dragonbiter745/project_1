import { test, expect } from '@playwright/test';
import { computeOrderTotals } from '@foodcourt/shared';
import { URLS, SEED_DATA } from '../helpers/constants';

test.describe('Journey F: Frontend & Backend Price & Money Alignment', () => {
  test('Integer paise computation matches between @foodcourt/shared and server checkout', async ({ page }) => {
    // 1. Verify computeOrderTotals locally
    const items = [
      { itemId: 'rm-feat-1', vendorId: 'vendor-roll-me', name: 'Chickpet Donne Biriyani', pricePaise: 14900, veg: false, qty: 2 },
      { itemId: 'sv-bk-3', vendorId: 'vendor-siddi-vinayaka', name: 'Idly Vada', pricePaise: 6500, veg: true, qty: 1 },
    ];
    const config = {
      pointsPerRupee: 0.1,
      pointsExpiryDays: 90,
      gstPct: 5,
      taxInclusive: true,
      platformFeePaise: 0,
      flags: { paymentsEnabled: true, loyaltyEnabled: true, maintenance: false },
    };

    const clientTotals = computeOrderTotals({ items, config });
    // Subtotal: 14900 * 2 + 6500 = 29800 + 6500 = 36300 paise (₹363)
    expect(clientTotals.subtotalPaise).toBe(36300);
    expect(Number.isInteger(clientTotals.subtotalPaise)).toBe(true);
    expect(Number.isInteger(clientTotals.taxPaise)).toBe(true);
    expect(Number.isInteger(clientTotals.totalPaise)).toBe(true);

    // 2. Now verify against the live server through createCheckout
    await page.addInitScript(() => {
      window.Cashfree = () => ({ checkout: async () => ({ paymentDetails: {} }) });
    });

    let serverTotalPaise = 0;
    page.on('response', async (res) => {
      if (res.url().includes('createCheckout') && res.status() === 200) {
        try {
          const data = await res.json();
          serverTotalPaise = data.result?.totalPaise;
        } catch {}
      }
    });

    await page.goto(`${URLS.customer}/t/${SEED_DATA.qrToken}`, { waitUntil: 'networkidle' });

    // Add Biriyani × 2
    const rollMeTab = page.locator('[role="tab"]:has-text("Roll Me")');
    await rollMeTab.waitFor({ state: 'visible' });
    await rollMeTab.click();
    await page.getByRole('button', { name: 'Add Chickpet Donne Biriyani' }).click();

    // Add Idly Vada × 1
    const svTab = page.locator('[role="tab"]:has-text("Siddi Vinayaka")');
    await svTab.waitFor({ state: 'visible' });
    await svTab.click();
    await page.getByRole('button', { name: 'Add Idly Vada' }).click();

    // Open Cart and increment Biriyani to 2
    await page.getByRole('button', { name: /View cart/i }).click();
    const cartSheet = page.getByRole('dialog', { name: 'Your order' });
    await cartSheet.getByRole('button', { name: 'Add one more Chickpet Donne Biriyani' }).click();
    await page.waitForTimeout(500);

    // Verify UI displays exact computed total ₹363
    await expect(cartSheet).toContainText('₹363');

    // Click Pay
    const payBtn = cartSheet.getByRole('button', { name: /^Pay /i });
    await payBtn.click();
    await page.waitForTimeout(2000);

    // Verify server checkout returned exact same integer total in paise
    expect(serverTotalPaise).toBe(36300);
  });
});
