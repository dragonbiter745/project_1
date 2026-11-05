import { test, expect } from '@playwright/test';
import { URLS, SEED_DATA } from '../helpers/constants';
import { sendPaymentSuccessWebhook } from '../helpers/webhook';
import { queryFirestore } from '../helpers/firestore';
import { getAdminAuth } from '../helpers/auth';
import { razorpayMock } from '../helpers/razorpayMock';

test.describe('Journey I: Diner Notifications & In-App Inbox', () => {
  test('Diner receives live visual alert when food is READY', async ({ page, browser }) => {
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
    await expect(page.locator('body')).toContainText('Table T-14');
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

    // Query ticket token from Firestore
    let token = '';
    for (let i = 0; i < 10; i++) {
      const subs = await queryFirestore('subOrders', { field: 'orderId', op: 'EQUAL', value: createdOrderId! });
      if (subs.length > 0 && subs[0].token) {
        token = subs[0].token;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(token).toBeTruthy();

    // Verify initial active order bar displays in-progress status
    const activeOrderBar = page.locator('.float-bar').filter({ hasText: /Track|Order in progress|Confirming payment|Ready/i });
    await expect(activeOrderBar).toBeVisible();
    await expect(activeOrderBar).toContainText(/Order in progress|Confirming payment/i);

    // Kitchen moves ticket: NEW -> ACCEPTED -> READY
    const kitchenContext = await browser.newContext();
    const kitchenPage = await kitchenContext.newPage();

    await kitchenPage.goto(URLS.vendor, { waitUntil: 'networkidle' });
    await kitchenPage.fill('input[type="email"]', SEED_DATA.staff.kitchenRollMe.email);
    await kitchenPage.fill('input[type="password"]', SEED_DATA.staff.kitchenRollMe.password);
    await kitchenPage.click('button[type="submit"]');

    const startServiceBtn = kitchenPage.getByRole('button', { name: 'Start service' });
    await startServiceBtn.waitFor({ state: 'visible', timeout: 15000 });
    await startServiceBtn.click();
    await startServiceBtn.waitFor({ state: 'hidden', timeout: 5000 });

    // Target the specific ticket card with token in "New orders"
    const newSection = kitchenPage.locator('section[aria-label="New orders"]');
    const newCard = newSection.locator('article', { hasText: token });
    await newCard.waitFor({ state: 'visible', timeout: 15000 });

    const acceptBtn = newCard.getByRole('button', { name: 'Accept' });
    await acceptBtn.click();

    // Now ticket moves to "Cooking orders", where the action button is "Mark ready"
    const cookingSection = kitchenPage.locator('section[aria-label="Cooking orders"]');
    const cookingCard = cookingSection.locator('article', { hasText: token });
    await cookingCard.waitFor({ state: 'visible', timeout: 15000 });

    const markReadyBtn = cookingCard.getByRole('button', { name: /Mark ready|Ready/i });
    await markReadyBtn.click();
    await kitchenPage.waitForTimeout(1000);

    await kitchenContext.close();

    // Back to diner's browser: When food is marked READY, useReadyAlert automatically pops open
    // the Tracking Sheet with a celebration alert ("ready at the counter") and token callout!
    await page.bringToFront();
    const trackingDialog = page.getByRole('dialog').filter({ hasText: /ready at the counter/i });
    await expect(trackingDialog).toBeVisible({ timeout: 15000 });
    await expect(trackingDialog).toContainText(token);
    await expect(trackingDialog.getByRole('button', { name: new RegExp(`Show token ${token}`, 'i') })).toBeVisible();
  });

  test('In-app inbox displays messages and marks them read upon viewing', async ({ page }) => {
    const uniqueEmail = `priya_${Date.now()}@foodcourt.local`;

    await page.goto(`${URLS.customer}/t/${SEED_DATA.qrToken}`, { waitUntil: 'networkidle' });

    // Open Account Hub
    await page.getByRole('button', { name: 'Your account' }).click();

    // In Account Hub, click "Sign in or create account"
    const signInBtn = page.getByRole('button', { name: /Sign in or create account/i });
    await expect(signInBtn).toBeVisible();
    await signInBtn.click();

    // Check consent checkbox on choose options screen
    const chooseModal = page.getByRole('dialog', { name: /Sign in to Qrave/i });
    await chooseModal.waitFor({ state: 'visible', timeout: 8000 });

    const consentBox = chooseModal.locator('input[type="checkbox"]');
    if (await consentBox.isVisible()) {
      await consentBox.check();
    }

    const signUpBtn = chooseModal.getByRole('button', { name: /Sign up with email/i });
    await expect(signUpBtn).toBeVisible();
    await signUpBtn.click();

    // Fill signup form
    const signupModal = page.getByRole('dialog', { name: /Create your account/i });
    await signupModal.waitFor({ state: 'visible', timeout: 5000 });

    await signupModal.getByLabel(/Full name/i).fill('Priya Sharma');
    await signupModal.getByLabel(/Email/i).fill(uniqueEmail);
    await signupModal.getByLabel(/Mobile number/i).fill('9876543210');
    await signupModal.locator('input[type="password"]').fill('dinerpass123');

    const formConsent = signupModal.locator('input[type="checkbox"]');
    if (await formConsent.isVisible()) {
      await formConsent.check();
    }

    await signupModal.getByRole('button', { name: 'Create account' }).click();
    await page.waitForTimeout(3000);

    // Retrieve user UID from Auth Emulator via Admin SDK
    const adminAuth = getAdminAuth();
    const user = await adminAuth.getUserByEmail(uniqueEmail);
    expect(user).toBeTruthy();
    const dinerUid = user.uid;

    // Write a test message into the diner's inbox collection directly in Firestore emulator
    const messageId = `msg_test_${Date.now()}`;
    const firestoreUrl = `http://127.0.0.1:8080/v1/projects/demo-foodcourt/databases/default/documents/inbox/${messageId}`;
    await fetch(firestoreUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer owner',
      },
      body: JSON.stringify({
        fields: {
          id: { stringValue: messageId },
          uid: { stringValue: dinerUid },
          campaignId: { stringValue: 'camp_promo_01' },
          title: { stringValue: 'Special Campus Offer' },
          body: { stringValue: 'Get 20% off all beverages today at Juice Junction!' },
          createdAt: { integerValue: String(Date.now()) },
        },
      }),
    });

    // Wait for live listener sync
    await page.waitForTimeout(2000);

    // Check if Inbox row is already visible in open Account Hub; if not, click Your account
    const inboxRow = page.getByRole('button', { name: /Inbox/i });
    if (!(await inboxRow.isVisible())) {
      const accountBtn = page.getByRole('button', { name: 'Your account' });
      await accountBtn.click({ force: true });
    }

    // In Account Hub, click Inbox
    await expect(inboxRow).toBeVisible({ timeout: 10000 });
    await inboxRow.click();

    // Verify InboxScreen renders the message
    await expect(page.locator('body')).toContainText('Special Campus Offer');
    await expect(page.locator('body')).toContainText('Get 20% off all beverages today at Juice Junction!');

    // Verify after viewing, message is marked read in Firestore
    await page.waitForTimeout(1500);
    const readCheckRes = await fetch(firestoreUrl, {
      headers: { Authorization: 'Bearer owner' },
    });
    const readCheckData = await readCheckRes.json();
    expect(readCheckData.fields?.readAt?.integerValue).toBeTruthy();
  });
});
