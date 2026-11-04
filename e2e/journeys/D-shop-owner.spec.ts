import { test, expect } from '@playwright/test';
import { URLS, SEED_DATA } from '../helpers/constants';

test.describe('Journey D: Shop Owner Controls (Stock, Pause, Reports)', () => {
  test('Stock toggle: marking dish sold out updates customer app live', async ({ browser }) => {
    const vendorContext = await browser.newContext();
    const vendorPage = await vendorContext.newPage();

    // 1. Kitchen logs in
    await vendorPage.goto(URLS.vendor, { waitUntil: 'networkidle' });
    await vendorPage.fill('input[type="email"]', SEED_DATA.staff.kitchenRollMe.email);
    await vendorPage.fill('input[type="password"]', SEED_DATA.staff.kitchenRollMe.password);
    await vendorPage.click('button[type="submit"]');

    // Dismiss Start service modal
    const startServiceBtn = vendorPage.getByRole('button', { name: 'Start service' });
    await startServiceBtn.waitFor({ state: 'visible', timeout: 15000 });
    await startServiceBtn.click();
    await startServiceBtn.waitFor({ state: 'hidden', timeout: 5000 });

    // Open Stock management
    const stockBtn = vendorPage.getByRole('button', { name: /Stock/i });
    await expect(stockBtn).toBeVisible();
    await stockBtn.click();

    const stockSheet = vendorPage.locator('[role="dialog"]:has-text("Stock")');
    await expect(stockSheet).toBeVisible();

    // Toggle Biriyani out of stock
    const switchBtn = stockSheet.getByRole('switch', { name: 'Chickpet Donne Biriyani in stock' });
    await expect(switchBtn).toHaveAttribute('aria-checked', 'true');
    await switchBtn.click();
    await expect(switchBtn).toHaveAttribute('aria-checked', 'false');
    await vendorPage.waitForTimeout(2000);

    // 2. In Customer app, verify it became Sold out
    const dinerContext = await browser.newContext();
    const dinerPage = await dinerContext.newPage();

    await dinerPage.goto(`${URLS.customer}/t/${SEED_DATA.qrToken}`, { waitUntil: 'networkidle' });
    const rollMeTab = dinerPage.locator('[role="tab"]:has-text("Roll Me")');
    await rollMeTab.waitFor({ state: 'visible', timeout: 15000 });
    await rollMeTab.click();

    const customerItem = dinerPage.locator('li:has-text("Chickpet Donne Biriyani"):not(:has-text("Combo"))');
    await expect(customerItem).toContainText('Sold out');

    // Restore stock
    await switchBtn.click();
    await vendorPage.waitForTimeout(1000);

    await vendorContext.close();
    await dinerContext.close();
  });

  test('Shop Admin console: finance staff can view shop settlements and orders', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    // Login to Shop Admin (:5176) with finance credentials
    await adminPage.goto(URLS.admin, { waitUntil: 'networkidle' });
    await adminPage.fill('input[type="email"]', 'finance-rm@foodcourt.local');
    await adminPage.fill('input[type="password"]', 'password123');
    await adminPage.click('button[type="submit"]');

    await adminPage.waitForTimeout(3000);
    // Verify Roll Me finance shell loaded
    await expect(adminPage.locator('body')).toContainText(/Roll Me|Today|Revenue|Orders/i);

    await adminContext.close();
  });
});
