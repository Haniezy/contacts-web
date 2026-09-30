import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect, fixture } from './fixtures';

// Logout lives in the drawer (mobile) or the account dropdown (desktop).
async function logout(page: Page) {
  const menu = page.getByRole('button', { name: 'منو' });
  await (
    (await menu.isVisible())
      ? menu
      : page.getByRole('button', { name: 'حساب کاربری' })
  ).click();
  await page.getByRole('button', { name: 'خروج', exact: true }).click();
}

test('landing → signup → QR → verification → recovery codes → contacts; two-factor login rejects invalid codes', async ({
  page,
  context,
}) => {
  const email = `browser-test-${randomUUID()}@contacts.example`;
  const password = 'Browser test password 123!';
  try {
    await page.goto('/');
    await expect(page.locator('header')).toHaveCount(0);
    await page.getByRole('link', { name: 'ساخت حساب', exact: true }).click();
    await page.getByLabel('نام', { exact: true }).fill('سارا');
    await page.getByLabel('نام خانوادگی', { exact: true }).fill('احمدی');
    await page.getByLabel('ایمیل', { exact: true }).fill(email);
    await page.getByLabel('رمز عبور', { exact: true }).fill(password);
    await page.getByLabel('تکرار رمز عبور', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'ساخت حساب', exact: true }).click();
    await expect(page).toHaveURL(/\/2fa\/setup$/);
    await expect(
      page.getByAltText('کد QR راه‌اندازی تایید دو مرحله‌ای'),
    ).toBeVisible();
    const secret = (
      await page.locator('.secret-code code').innerText()
    ).replaceAll(' ', '');
    expect(fixture({ action: 'names', email })).toEqual({
      firstName: 'سارا',
      lastName: 'احمدی',
    });
    await page.getByRole('button', { name: 'ادامه', exact: true }).click();
    const code = fixture<string>({ action: 'totp', secret });
    await page
      .getByRole('textbox', { name: 'رقم ۱', exact: true })
      .fill(code.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));
    await page
      .getByRole('button', { name: 'تایید و فعال‌سازی', exact: true })
      .click();
    await expect(page.locator('.recovery-codes li')).toHaveCount(10);
    const recovery = await page
      .locator('.recovery-codes code')
      .first()
      .innerText();
    await page.getByRole('checkbox').check();
    await page
      .getByRole('link', { name: 'ورود به مخاطبین', exact: true })
      .click();
    await expect(page).toHaveURL(/\/contacts$/);
    await expect(page.getByText('هنوز مخاطبی نداری.')).toBeVisible();
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === 'contacts_session');
    expect(session?.httpOnly).toBe(true);
    expect(session?.path).toBe('/');
    expect(
      await page.evaluate(() => document.cookie.includes('contacts_session')),
    ).toBe(false);
    await logout(page);
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('ایمیل', { exact: true }).fill(email);
    await page.getByLabel('رمز عبور', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'ورود', exact: true }).click();
    await expect(page).toHaveURL(/\/2fa$/);
    expect((await page.request.get('/api/contacts')).status()).toBe(401);
    const current = fixture<string>({ action: 'totp', secret });
    const invalid = current === '000000' ? '111111' : '000000';
    await page
      .getByRole('textbox', { name: 'رقم ۱', exact: true })
      .fill(invalid);
    await page
      .getByRole('button', { name: 'تایید و ورود', exact: true })
      .click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect((await page.request.get('/api/contacts')).status()).toBe(401);
    const nextCode = fixture<string>({ action: 'totp', secret, offset: 30 });
    await page
      .getByRole('textbox', { name: 'رقم ۱', exact: true })
      .fill(nextCode);
    await page
      .getByRole('button', { name: 'تایید و ورود', exact: true })
      .click();
    await expect(page).toHaveURL(/\/contacts$/);
    await logout(page);
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('ایمیل', { exact: true }).fill(email);
    await page.getByLabel('رمز عبور', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'ورود', exact: true }).click();
    await expect(page).toHaveURL(/\/2fa$/);
    await page
      .getByRole('button', { name: 'استفاده از کد بازیابی', exact: true })
      .click();
    await page.getByLabel('کد بازیابی', { exact: true }).fill(recovery);
    await page
      .getByRole('button', { name: 'تایید و ورود', exact: true })
      .click();
    await expect(page).toHaveURL(/\/contacts$/);
    await page.reload();
    await expect(page.getByText('هنوز مخاطبی نداری.')).toBeVisible();
  } finally {
    fixture({ action: 'delete', email });
  }
});

test('route protection checks forged sessions; BFF blocks cross-origin changes; forms validate', async ({
  page,
  context,
  request,
}) => {
  await page.goto('/contacts');
  await expect(page).toHaveURL(/\/login$/);
  await context.addCookies([
    {
      name: 'contacts_session',
      value: 'forged',
      domain: '127.0.0.1',
      path: '/',
    },
  ]);
  await page.goto('/contacts');
  await expect(page).toHaveURL(/\/login$/);
  const csrf = await request.post('/api/auth/signup', {
    headers: { Origin: 'https://other.example' },
    data: { email: 'ignored@example.com', password: 'ignored' },
  });
  expect(csrf.status()).toBe(403);
  await page.goto('/signup');
  await page.getByRole('button', { name: 'ساخت حساب', exact: true }).click();
  await expect(page.getByLabel('ایمیل', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByLabel('رمز عبور', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await page
    .getByLabel('رمز عبور', { exact: true })
    .fill('long password example');
  await page
    .getByRole('button', { name: 'نمایش رمز عبور', exact: true })
    .first()
    .click();
  await expect(page.getByLabel('رمز عبور', { exact: true })).toHaveAttribute(
    'type',
    'text',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
