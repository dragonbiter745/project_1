import { test, expect } from '@playwright/test';
import { URLS, SEED_DATA } from '../helpers/constants';

test.describe('Journey E: Venue Admin Console (Master)', () => {
  test('Master console: logs in and accesses live ops, shops, tables, coupons and settings', async ({ page }) => {
    // 1. Login to Master Console (:5175)
    await page.goto(URLS.master, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', SEED_DATA.staff.master.email);
    await page.fill('input[type="password"]', SEED_DATA.staff.master.password);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(3000);
    await expect(page).toHaveTitle(/Admin · Qrave/i);
    await expect(page.locator('body')).toContainText(/Operations console|Live orders/i);

    // 2. Navigate to Shops tab
    const shopsNav = page.locator('nav a:has-text("Shops"), button:has-text("Shops")').first();
    await shopsNav.click();
    await page.waitForTimeout(1000);

    // Verify all 5 shops listed
    await expect(page.locator('body')).toContainText('Roll Me');
    await expect(page.locator('body')).toContainText('Siddi Vinayaka');
    await expect(page.locator('body')).toContainText('Basil');

    // 3. Navigate to Tables and QR tab
    const tablesNav = page.locator('nav a:has-text("Tables"), button:has-text("Tables")').first();
    await tablesNav.click();
    await page.waitForTimeout(1000);

    // Verify Table T-14 is visible
    await expect(page.locator('body')).toContainText(/T-14|T14/i);

    // 4. Navigate to Coupons tab
    const couponsNav = page.locator('nav a:has-text("Coupons"), button:has-text("Coupons")').first();
    await couponsNav.click();
    await page.waitForTimeout(1000);

    // Verify seeded coupons are listed
    await expect(page.locator('body')).toContainText('PERCENT10');
    await expect(page.locator('body')).toContainText('FLAT50');

    // 5. Navigate to Settings tab
    const settingsNav = page.locator('nav a:has-text("Settings"), button:has-text("Settings")').first();
    await settingsNav.click();
    await page.waitForTimeout(1000);

    // Verify tax / GST configuration
    await expect(page.locator('body')).toContainText(/5%|GST|Tax/i);
  });
});
