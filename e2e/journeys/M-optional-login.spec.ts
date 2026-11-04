import { test, expect } from '@playwright/test';
import { URLS, SEED_DATA } from '../helpers/constants';

test.describe('Journey M: login is optional, no age gate', () => {
  test('A visitor on the website (no QR, no login) can order as a guest with a generated name', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).Cashfree = () => ({ checkout: async () => ({ paymentDetails: {} }) });
    });

    let checkout: { orderId?: string; totalPaise?: number } = {};
    let pickup: { displayName?: string; tableLabel?: string } = {};
    let sawLoginDialog = false;
    page.on('response', async (res) => {
      if (res.status() !== 200) return;
      try {
        if (res.url().includes('createCheckout')) checkout = (await res.json()).result ?? {};
        else if (res.url().includes('startSession')) pickup = (await res.json()).result ?? {};
      } catch {
        // not JSON
      }
    });

    // Straight to the ordering site: no /t/<token>, so this is the website (pickup) mode.
    await page.goto(`${URLS.customer}/`, { waitUntil: 'networkidle' });

    await page.locator('[role="tab"]:has-text("Roll Me")').first().click();
    await page.locator('li:has-text("Chickpet Donne Biriyani"):not(:has-text("Combo"))').getByRole('button', { name: /Add /i }).click();
    await page.getByRole('button', { name: /View cart/i }).click();

    const cart = page.getByRole('dialog', { name: 'Your order' });
    await expect(cart).toBeVisible();
    await expect(cart).toContainText('Chickpet Donne Biriyani');

    // The button is a normal Pay button, not "Sign in to order".
    await expect(cart.getByRole('button', { name: /Sign in to order/i })).toHaveCount(0);
    const pay = cart.getByRole('button', { name: /^Pay /i });
    await expect(pay).toBeEnabled();

    await pay.click();
    await expect.poll(() => checkout.orderId, { timeout: 15000 }).toBeTruthy();
    sawLoginDialog = await page.getByRole('dialog', { name: /log in|sign in|welcome/i }).isVisible().catch(() => false);

    expect(sawLoginDialog).toBe(false);
    expect(checkout.totalPaise).toBe(14900);
    // The server named the guest and opened a Pickup session; no account was asked for.
    expect(pickup.tableLabel).toBe('Pickup');
    expect(pickup.displayName && pickup.displayName.length > 2).toBeTruthy();
  });

  test('Sign-up consent asks only for Terms and Privacy, never an age, and guest stays one tap away', async ({ page }) => {
    await page.goto(`${URLS.customer}/t/${SEED_DATA.qrToken}`, { waitUntil: 'networkidle' });

    // Table diners land on the menu already named (a guest), with an optional Sign in button.
    await expect(page.locator('body')).toContainText('Table T-14');
    await page.getByRole('button', { name: 'Sign in' }).first().click();
    const welcome = page.getByRole('dialog').last();
    await expect(welcome).toBeVisible();
    await expect(welcome.getByRole('checkbox')).not.toBeChecked();
    await expect(welcome).toContainText(/I agree to the\s*Terms.*and\s*Privacy Policy/i);
    await expect(welcome).not.toContainText(/\b18\b|\bolder\b|\badult/i);
    await expect(welcome.getByRole('button', { name: /Continue with Google/i })).toBeVisible();

    // Trying Google without ticking shows the new, age-free error and starts nothing.
    await welcome.getByRole('button', { name: /Continue with Google/i }).click();
    await expect(welcome.getByRole('alert')).toContainText(/Tick the box to continue/i);
    await expect(welcome.getByRole('alert')).not.toContainText(/\b18\b|\bunder\b/i);

    // Guest is still one tap and closes the sheet.
    await welcome.getByRole('button', { name: /guest/i }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('body')).toContainText('Table T-14');
  });
});
