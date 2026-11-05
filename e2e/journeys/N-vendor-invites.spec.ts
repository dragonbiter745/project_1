import { test, expect, type Page } from '@playwright/test';
import { URLS, SEED_DATA } from '../helpers/constants';

const OUTBOX = `${URLS.firestore}/v1/projects/demo-foodcourt/databases/default/documents/mailOutbox`;

/** The newest email kept by the Functions emulator for this address (it has no mail account). */
async function latestMailTo(email: string): Promise<{ subject: string; text: string }> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${OUTBOX}?pageSize=100`, { headers: { Authorization: 'Bearer owner' } });
    const docs = ((await res.json()) as { documents?: Array<{ fields: Record<string, { stringValue?: string; integerValue?: string }> }> }).documents ?? [];
    const mine = docs
      .filter((d) => d.fields.to?.stringValue === email)
      .sort((a, b) => Number(b.fields.at?.integerValue ?? 0) - Number(a.fields.at?.integerValue ?? 0));
    if (mine[0]) return { subject: mine[0].fields.subject!.stringValue!, text: mine[0].fields.text!.stringValue! };
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email arrived for ${email}`);
}

async function masterVendorsPage(page: Page) {
  await page.goto(URLS.master, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', SEED_DATA.staff.master.email);
  await page.fill('input[type="password"]', SEED_DATA.staff.master.password);
  await page.click('button[type="submit"]');
  await page.locator('nav button:has-text("Vendors")').first().click();
  await expect(page.getByRole('heading', { name: 'Vendors', level: 1 })).toBeVisible();
}

test.describe('Journey N: the court manager emails vendors their login', () => {
  test('Invite by email, vendor picks their own password through the link, link works once', async ({ page, browser }) => {
    const email = `qa-owner-${Date.now()}@shopmail.com`;
    await masterVendorsPage(page);

    // Seeded logins use stand-in addresses, so the page offers to invite the real email instead.
    await expect(page.locator('body')).toContainText('Stand-in address, not a real inbox');
    await expect(page.getByRole('button', { name: 'Invite real email' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Invite a login' }).click();
    const sheet = page.getByRole('dialog').last();
    await sheet.getByLabel('Their email').fill(email);
    await sheet.getByLabel('Shop', { exact: true }).selectOption({ label: 'Roll Me' });
    await sheet.getByRole('button', { name: 'Send invite' }).click();

    await expect(page.getByRole('status')).toContainText(`Email sent to ${email}`);
    const row = page.locator('li', { hasText: email });
    await expect(row).toContainText('Invite sent');

    // The email: short, branded, one button to a link that carries a one-time token.
    const mail = await latestMailTo(email);
    expect(mail.subject).toBe('Set up your Qrave login for Roll Me');
    const link = mail.text.match(/https?:\/\/\S+/)![0];
    const token = new URL(link).searchParams.get('t')!;
    expect(token.length).toBeGreaterThan(30);
    expect(new URL(link).pathname).toBe('/set-password');

    // The vendor opens the link (the local vendor app stands in for the deployed one).
    const vendor = await browser.newContext();
    const vp = await vendor.newPage();
    await vp.goto(`${URLS.vendor}/set-password?t=${token}`, { waitUntil: 'domcontentloaded' });
    await expect(vp.getByRole('heading', { name: 'Choose your password' })).toBeVisible();
    await expect(vp.locator('body')).toContainText('Roll Me');
    await expect(vp.locator('body')).toContainText(email);

    const save = vp.getByRole('button', { name: 'Save and sign in' });
    await expect(save).toBeDisabled();
    await vp.getByLabel('New password', { exact: true }).fill('short1');
    await expect(save).toBeDisabled();
    await vp.getByLabel('New password', { exact: true }).fill('Roll-Me-Owner-42');
    await vp.getByLabel('Type it again').fill('Roll-Me-Owner-43');
    await expect(vp.locator('body')).toContainText('do not match');
    await expect(save).toBeDisabled();
    await vp.getByLabel('Type it again').fill('Roll-Me-Owner-42');
    await expect(save).toBeEnabled();
    await save.click();

    // Signed in straight away, in their own shop's kitchen, with the token gone from the address bar.
    await expect(vp.getByRole('heading', { name: 'Choose your password' })).toHaveCount(0, { timeout: 20000 });
    await expect(vp.locator('body')).toContainText('Roll Me', { timeout: 20000 });
    expect(vp.url()).not.toContain('set-password');
    expect(vp.url()).not.toContain(token);

    // The link now refuses: it works once.
    const again = await browser.newContext();
    const ap = await again.newPage();
    await ap.goto(`${URLS.vendor}/set-password?t=${token}`, { waitUntil: 'domcontentloaded' });
    await expect(ap.getByText('This link no longer works')).toBeVisible();
    await expect(ap.getByText('expired or was already used')).toBeVisible();

    // And the new password is the one that signs in.
    const fresh = await browser.newContext();
    const fp = await fresh.newPage();
    await fp.goto(URLS.vendor, { waitUntil: 'domcontentloaded' });
    await fp.fill('input[type="email"]', email);
    await fp.fill('input[type="password"]', 'Roll-Me-Owner-42');
    await fp.click('button[type="submit"]');
    await expect(fp.locator('body')).toContainText('Roll Me', { timeout: 20000 });

    // The manager now sees them as active and can send a reset link.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('nav button:has-text("Vendors")').first().click();
    const active = page.locator('li', { hasText: email });
    await expect(active).toContainText('Active');
    await active.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText(`Reset link sent to ${email}`);
    expect((await latestMailTo(email)).subject).toBe('Reset your Qrave password for Roll Me');

    // Switch off: the old password stops working.
    await active.getByRole('button', { name: 'Switch off' }).click();
    await expect(active).toContainText('Switched off');
    const blocked = await browser.newContext();
    const bp = await blocked.newPage();
    await bp.goto(URLS.vendor, { waitUntil: 'domcontentloaded' });
    await bp.fill('input[type="email"]', email);
    await bp.fill('input[type="password"]', 'Roll-Me-Owner-42');
    await bp.click('button[type="submit"]');
    await expect(bp.getByRole('alert')).toContainText(/switched off|do not match/i);

    // Remove the login.
    await active.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('dialog').last().getByRole('button', { name: 'Remove login' }).click();
    await expect(page.getByRole('status')).toContainText(`Removed the login for ${email}`);
    await expect(page.locator('li', { hasText: email })).toHaveCount(0);

    await Promise.all([vendor.close(), again.close(), fresh.close(), blocked.close()]);
  });

  test('Add a shop, invite its owner, then remove the shop', async ({ page }) => {
    const name = `QA Tiffins ${Date.now().toString().slice(-5)}`;
    await masterVendorsPage(page);

    await page.getByRole('button', { name: 'Add shop' }).first().click();
    const sheet = page.getByRole('dialog').last();
    await sheet.getByLabel('Shop name').fill(name);
    await expect(sheet.getByLabel('Token code')).toHaveValue('QT');
    // A fresh code each run: a shop left behind by an interrupted run must not make this one fail.
    const code = Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
    await sheet.getByLabel('Token code').fill(code);
    await sheet.getByRole('button', { name: 'Add shop' }).click();

    // The invite sheet opens next with the new shop already chosen.
    await expect(page.getByRole('status')).toContainText(`${name} added`);
    const invite = page.getByRole('dialog').last();
    await expect(invite.getByRole('heading', { name: 'Invite a login' })).toBeVisible();
    await expect(invite.getByLabel('Shop', { exact: true })).toHaveValue(/vendor-qa-tiffins/);
    await page.keyboard.press('Escape');

    const card = page.locator('article', { hasText: name });
    await expect(card).toBeVisible();
    await expect(card).toContainText('No logins yet');
    await expect(page.locator('section[aria-label="Needs attention"]')).toContainText(name);

    // Removing needs the exact name typed.
    await card.getByRole('button', { name: `Remove ${name}` }).click();
    const confirm = page.getByRole('dialog').last();
    const remove = confirm.getByRole('button', { name: 'Remove shop' });
    await expect(remove).toBeDisabled();
    await confirm.getByLabel(/Type/).fill(name);
    await expect(remove).toBeEnabled();
    await remove.click();
    await expect(page.getByRole('status')).toContainText(`${name} was removed`);
    await expect(page.locator('article', { hasText: name })).toHaveCount(0);
  });
});
