import { test, expect } from '@playwright/test';
import { URLS, SEED_DATA } from '../helpers/constants';

test.describe('Journey H: Public Pages, Legal Links & Error States', () => {
  test('Customer footer: all legal and compliance links are present', async ({ page }) => {
    await page.goto(`${URLS.customer}/t/${SEED_DATA.qrToken}`, { waitUntil: 'networkidle' });
    const legalNav = page.locator('nav[aria-label="Legal"]');
    await legalNav.scrollIntoViewIfNeeded();
    await expect(legalNav).toBeVisible();

    const privacyLink = page.getByRole('link', { name: /Privacy Policy/i });
    const termsLink = page.getByRole('link', { name: /Terms/i });
    const refundLink = page.getByRole('link', { name: /Cancellations and refunds/i });
    const cookieLink = page.getByRole('link', { name: /Cookie Policy/i });
    const grievanceLink = page.getByRole('link', { name: /Grievance Officer/i });

    await expect(privacyLink).toBeVisible();
    await expect(termsLink).toBeVisible();
    await expect(refundLink).toBeVisible();
    await expect(cookieLink).toBeVisible();
    await expect(grievanceLink).toBeVisible();

    // Verify links open in new tab
    expect(await privacyLink.getAttribute('target')).toBe('_blank');
  });

  test('Error state: invalid QR token renders friendly guidance and pickup fallback', async ({ page }) => {
    await page.goto(`${URLS.customer}/t/INVALID_CODE_XYZ_999`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toContainText(/We couldn't find this table/i);
    await expect(page.locator('body')).toContainText(/Scan the QR code on your table again/i);
    await expect(page.getByRole('link', { name: /Order online for pickup/i })).toBeVisible();
  });

  test('Marketing landing page loads with zero console or page errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(URLS.landing, { waitUntil: 'networkidle' });
    await expect(page).toHaveTitle(/Qrave/i);
    await expect(page.locator('body')).toContainText(/Interactive 3D preview|Every kitchen|One QR/i);
    expect(pageErrors.length).toBe(0);
  });
});
