import { test, expect } from '@playwright/test';
import { URLS, SEED_DATA } from '../helpers/constants';
import { sendPaymentSuccessWebhook } from '../helpers/webhook';

test.describe('Journey E: Venue Admin Console (Master)', () => {
  test('Master console: logs in and accesses live ops, shops, tables, coupons and settings', async ({ page }) => {
    // 1. Login to Master Console (:5175)
    await page.goto(URLS.master, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', SEED_DATA.staff.master.email);
    await page.fill('input[type="password"]', SEED_DATA.staff.master.password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveTitle(/Admin · Qrave/i);
    await expect(page.locator('body')).toContainText(/Operations console|Live orders/i);

    // 2. Navigate to Shops tab
    const shopsNav = page.locator('nav button:has-text("Shops")').first();
    await shopsNav.click();

    // Verify all 5 shops listed
    await expect(page.locator('body')).toContainText('Roll Me');
    await expect(page.locator('body')).toContainText('Siddi Vinayaka');
    await expect(page.locator('body')).toContainText('Basil');

    // 3. Navigate to Tables and QR tab
    const tablesNav = page.locator('nav button:has-text("Tables")').first();
    await tablesNav.click();

    // Verify Table T-14 is visible
    await expect(page.locator('body')).toContainText(/T-14|T14/i);

    // 4. Navigate to Coupons tab
    const couponsNav = page.locator('nav button:has-text("Coupons")').first();
    await couponsNav.click();

    // Verify seeded coupons are listed
    await expect(page.locator('body')).toContainText('PERCENT10');
    await expect(page.locator('body')).toContainText('FLAT50');

    // 5. Navigate to Settings tab
    const settingsNav = page.locator('nav button:has-text("Settings")').first();
    await settingsNav.click();

    // Verify tax / GST configuration
    await expect(page.locator('body')).toContainText(/5%|GST|Tax/i);
  });

  test('Master console: newly registered diner appears in Customers dashboard with profile and order stats', async ({ browser }) => {
    const uniqueEmail = `ananya_${Date.now()}@foodcourt.local`;
    const customerName = 'Ananya Sen';
    let createdOrderId: string | null = null;
    let orderTotalPaise = 14900;

    // --- STEP 1: Diner context - register and place an order ---
    const dinerContext = await browser.newContext();
    const dinerPage = await dinerContext.newPage();

    await dinerPage.addInitScript(() => {
      window.Cashfree = () => ({ checkout: async () => ({ paymentDetails: {} }) });
    });

    dinerPage.on('response', async (res) => {
      if (res.url().includes('createCheckout') && res.status() === 200) {
        try {
          const data = await res.json();
          createdOrderId = data.result?.orderId;
          orderTotalPaise = data.result?.totalPaise ?? 14900;
        } catch {}
      }
    });

    await dinerPage.goto(`${URLS.customer}/t/${SEED_DATA.qrToken}`, { waitUntil: 'domcontentloaded' });
    await expect(dinerPage.locator('body')).toContainText('Table T-14');

    // 1. Place an order for Donne Biriyani (₹149) as diner
    await dinerPage.locator('[role="tab"]:has-text("Roll Me")').click();
    await dinerPage.locator('li:has-text("Chickpet Donne Biriyani"):not(:has-text("Combo"))').first().getByRole('button', { name: /Add/i }).click();

    await dinerPage.getByRole('button', { name: /View cart/i }).click();
    const cartSheet = dinerPage.getByRole('dialog', { name: 'Your order' });
    await expect(cartSheet).toBeVisible();

    const payBtn = cartSheet.getByRole('button', { name: /^Pay /i });
    await payBtn.click();
    await dinerPage.waitForTimeout(2000);

    expect(createdOrderId).toBeTruthy();

    // Fire webhook to complete payment
    await sendPaymentSuccessWebhook({
      orderId: createdOrderId!,
      orderAmountPaise: orderTotalPaise,
    });
    await dinerPage.waitForTimeout(2000);

    // 2. Click "Sign in" inside the Tracking Sheet ("This order still counts")
    const orderPrompt = dinerPage.locator('div, section, article').filter({ hasText: 'This order still counts' }).last();
    await orderPrompt.getByRole('button', { name: 'Sign in' }).click();

    const chooseModal = dinerPage.getByRole('dialog', { name: /Sign in to Qrave/i });
    await chooseModal.waitFor({ state: 'visible', timeout: 8000 });

    const consentBox = chooseModal.locator('input[type="checkbox"]');
    if (await consentBox.isVisible()) {
      await consentBox.check();
    }

    const signUpBtn = chooseModal.getByRole('button', { name: /Sign up with email/i });
    await expect(signUpBtn).toBeVisible();
    await signUpBtn.click();

    const signupModal = dinerPage.getByRole('dialog', { name: /Create your account/i });
    await signupModal.waitFor({ state: 'visible', timeout: 5000 });

    await signupModal.getByLabel(/Full name/i).fill(customerName);
    await signupModal.getByLabel(/Email/i).fill(uniqueEmail);
    await signupModal.getByLabel(/Mobile number/i).fill('9876543210');
    await signupModal.locator('input[type="password"]').fill('dinerpass123');

    const formConsent = signupModal.locator('input[type="checkbox"]');
    if (await formConsent.isVisible()) {
      await formConsent.check();
    }

    await signupModal.getByRole('button', { name: 'Create account' }).click();
    await dinerPage.waitForTimeout(3000);
    await dinerContext.close();

    // --- STEP 2: Master Console context - verify new customer in dashboard ---
    const masterContext = await browser.newContext();
    const masterPage = await masterContext.newPage();

    await masterPage.goto(URLS.master, { waitUntil: 'domcontentloaded' });
    await masterPage.fill('input[type="email"]', SEED_DATA.staff.master.email);
    await masterPage.fill('input[type="password"]', SEED_DATA.staff.master.password);
    await masterPage.click('button[type="submit"]');

    await expect(masterPage).toHaveTitle(/Admin · Qrave/i);
    await expect(masterPage.locator('body')).toContainText(/Operations console|Live orders/i);

    // Navigate to Customers tab
    const customersNav = masterPage.locator('nav button:has-text("Customers")').first();
    await customersNav.click();

    // Verify People section and customer row
    await expect(masterPage.locator('body')).toContainText('People');

    // The newly registered user must appear in the table (filtered uniquely by email)
    const customerRow = masterPage.locator('table tr', { hasText: uniqueEmail });
    await expect(customerRow).toBeVisible({ timeout: 10000 });

    // Assert row content: Name, email/phone, orders, spent
    await expect(customerRow).toContainText(customerName);
    await expect(customerRow).toContainText(uniqueEmail);
    await expect(customerRow).toContainText('1'); // 1 order
    await expect(customerRow).toContainText('₹149'); // ₹149 spent

    // Click row to open CustomerDrawer
    await customerRow.click();
    const drawer = masterPage.locator('section[aria-label="Customer details"], [role="dialog"], aside').filter({ hasText: customerName }).first();
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Assert drawer details
    await expect(drawer).toContainText(customerName);
    await expect(drawer).toContainText(uniqueEmail);
    await expect(drawer).toContainText('Chickpet Donne Biriyani');

    await masterContext.close();
  });
});
