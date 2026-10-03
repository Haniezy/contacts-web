import type { Page } from '@playwright/test';
import { expect, fixture, test } from './fixtures';

test.beforeEach(async ({ context, account }) => {
  await context.addCookies([
    {
      name: 'contacts_session',
      value: account.token,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
});

async function openMenu(page: Page) {
  const menu = page.getByRole('button', { name: 'منو' });
  await (
    (await menu.isVisible())
      ? menu
      : page.getByRole('button', { name: 'حساب کاربری' })
  ).click();
  return page.getByRole('dialog', { name: 'منو' });
}
async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('ایمیل', { exact: true }).fill(email);
  await page.getByLabel('رمز عبور', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
}

test('the menu opens the profile, which changes the name and the password', async ({
  page,
  account,
}) => {
  await page.goto('/contacts');
  await (await openMenu(page)).getByRole('link', { name: 'پروفایل' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { name: 'پروفایل' })).toBeVisible();
  const email = page.getByLabel(/ایمیل/);
  await expect(email).toHaveValue(account.email);
  await expect(email).toHaveAttribute('readonly', '');

  await page.getByLabel('نام و نام خانوادگی').fill('نگار  صالحی');
  const current = page.getByLabel('رمز عبور فعلی', { exact: true });
  const next = page.getByLabel('رمز عبور جدید', { exact: true });
  const repeat = page.getByLabel('تکرار رمز جدید', { exact: true });
  await current.fill('wrong password');
  await next.fill('short');
  await page.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  await expect(
    page.getByText('رمز عبور باید بین ۸ تا ۱۲۸ کاراکتر باشه.'),
  ).toBeVisible();
  await expect(page.getByText('تکرار رمز عبور با رمز یکی نیست.')).toBeVisible();
  // The eye button shows what was typed.
  await page
    .locator('.field-newPassword')
    .getByRole('button', { name: 'نمایش رمز عبور' })
    .click();
  await expect(next).toHaveAttribute('type', 'text');

  const password = 'Changed test password 456!';
  await next.fill(password);
  await repeat.fill(password);
  await page.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  await expect(page.getByText('رمز عبور فعلی درست نیست.')).toBeVisible();
  await current.fill(account.password);
  await page.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect((await openMenu(page)).getByText('نگار صالحی')).toBeVisible();
  expect(fixture({ action: 'names', email: account.email })).toEqual({
    firstName: 'نگار',
    lastName: 'صالحی',
  });

  await page.getByRole('button', { name: 'خروج', exact: true }).click();
  await login(page, account.email, account.password);
  await expect(page.getByRole('alert')).toBeVisible();
  await login(page, account.email, password);
  await expect(page).toHaveURL(/\/contacts$/);
});

test('settings turn 2FA on and off, sign out everywhere and delete the account', async ({
  page,
  account,
}) => {
  await page.goto('/contacts');
  await (await openMenu(page)).getByRole('link', { name: 'تنظیمات' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByText('وضعیت: غیرفعال')).toBeVisible();

  // Off: the card leads to the setup flow, which comes back to settings.
  await page.getByRole('link', { name: /تایید دو مرحله‌ای/ }).click();
  await expect(page).toHaveURL(/\/2fa\/setup\?from=settings$/);
  await page.getByLabel('رمز عبور', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'ساخت کد QR' }).click();
  const secret = (
    await page.locator('.secret-code code').innerText()
  ).replaceAll(' ', '');
  await page.getByRole('button', { name: 'ادامه', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'رقم ۱', exact: true })
    .fill(fixture<string>({ action: 'totp', secret }));
  await page.getByRole('button', { name: 'تایید و فعال‌سازی' }).click();
  await expect(page.locator('.recovery-codes li')).toHaveCount(10);
  await page.getByRole('checkbox').check();
  await page.getByRole('link', { name: 'بازگشت به تنظیمات' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByText('وضعیت: فعال')).toBeVisible();

  // On: turning it off asks for the password and a fresh code.
  await page.getByRole('button', { name: /تایید دو مرحله‌ای/ }).click();
  const disable = page.getByRole('dialog', {
    name: 'غیرفعال کردن تایید دو مرحله‌ای',
  });
  await disable.getByLabel('رمز عبور', { exact: true }).fill(account.password);
  await disable.getByLabel('کد ۶ رقمی').fill('000000');
  await disable.getByRole('button', { name: 'غیرفعال کن' }).click();
  await expect(disable.getByRole('alert')).toBeVisible();
  await disable
    .getByLabel('کد ۶ رقمی')
    .fill(fixture<string>({ action: 'totp', secret, offset: 30 }));
  await disable.getByRole('button', { name: 'غیرفعال کن' }).click();
  await expect(disable).toBeHidden();
  await expect(page.getByText('وضعیت: غیرفعال')).toBeVisible();

  await page.getByRole('button', { name: /خروج از همه‌ی دستگاه‌ها/ }).click();
  await page.getByRole('button', { name: 'خروج از همه', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get('/api/contacts')).status()).toBe(401);

  await login(page, account.email, account.password);
  await expect(page).toHaveURL(/\/contacts$/);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'حذف حساب', exact: true }).click();
  const remove = page.getByRole('dialog', { name: 'حساب کاربری حذف بشه؟' });
  await remove.getByRole('button', { name: 'ادامه' }).click();
  const verify = page.getByRole('dialog', { name: 'تایید حذف حساب' });
  await verify.getByLabel('رمز عبور', { exact: true }).fill('wrong password');
  await verify.getByRole('button', { name: 'حذف همیشگی' }).click();
  await expect(verify.getByText('رمز عبور درست نیست.')).toBeVisible();
  await verify.getByLabel('رمز عبور', { exact: true }).fill(account.password);
  await verify.getByRole('button', { name: 'حذف همیشگی' }).click();
  await expect(page).toHaveURL(/\/$/);
  await login(page, account.email, account.password);
  await expect(page.getByText('ایمیل یا رمز عبور درست نیست.')).toBeVisible();
});
