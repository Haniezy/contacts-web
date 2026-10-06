import type { Page } from '@playwright/test';
import sharp from 'sharp';
import { expect, fixture, openMenu, test } from './fixtures';

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

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('ایمیل', { exact: true }).fill(email);
  await page.getByLabel('رمز عبور', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
}

test('the menu opens the profile, whose save changes only the name', async ({
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
  // No password fields until the user asks to change it.
  await expect(page.locator('input[type="password"]')).toHaveCount(0);

  await page.getByLabel('نام و نام خانوادگی').fill('نگار  صالحی');
  await page.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect((await openMenu(page)).getByText('نگار صالحی')).toBeVisible();
  expect(fixture({ action: 'names', email: account.email })).toEqual({
    firstName: 'نگار',
    lastName: 'صالحی',
  });
});

test('the password changes only through its own form, which checks the current password', async ({
  page,
  account,
}) => {
  await page.goto('/profile');
  const open = page.getByRole('button', { name: 'تغییر رمز عبور' });
  const current = page.getByLabel('رمز عبور فعلی', { exact: true });
  const next = page.getByLabel('رمز عبور جدید', { exact: true });
  const repeat = page.getByLabel('تکرار رمز جدید', { exact: true });
  const save = page.getByRole('button', { name: 'ذخیره رمز جدید' });

  // Cancel works at any point, straight from a field, with no error.
  await open.click();
  await expect(current).toBeFocused();
  await page.getByRole('button', { name: 'انصراف', exact: true }).click();
  await expect(current).toHaveCount(0);
  await expect(page.locator('.field-error')).toHaveCount(0);
  // Moving between fields shows no errors either: they belong to saving.
  await open.click();
  await current.press('Tab');
  await expect(page.locator('.field-error')).toHaveCount(0);
  await page.getByRole('button', { name: 'انصراف', exact: true }).click();
  // Cancel closes the form and forgets what was typed.
  await open.click();
  await expect(current).toBeFocused();
  await next.fill('something');
  await page.getByRole('button', { name: 'انصراف', exact: true }).click();
  await expect(next).toHaveCount(0);
  await open.click();
  await expect(next).toHaveValue('');

  // Every rule shows at once: current required, 6–16, matching repeat.
  await next.fill('short');
  await save.click();
  await expect(page.locator('#password-current-error')).toBeVisible();
  await expect(
    page.getByText('رمز عبور باید بین ۶ تا ۱۶ کاراکتر باشه.'),
  ).toBeVisible();
  await expect(page.getByText('تکرار رمز عبور با رمز یکی نیست.')).toBeVisible();
  // The eye button shows what was typed.
  await page
    .locator('.field-next')
    .getByRole('button', { name: 'نمایش رمز عبور' })
    .click();
  await expect(next).toHaveAttribute('type', 'text');
  // The new password must differ from the current one.
  await current.fill('Same pass 12');
  await next.fill('Same pass 12');
  await repeat.fill('Same pass 12');
  await save.click();
  await expect(
    page.getByText('رمز جدید باید با رمز فعلی فرق داشته باشه.'),
  ).toBeVisible();

  // A wrong current password changes nothing.
  const password = 'Changed test 45!';
  await current.fill('wrong password');
  await next.fill(password);
  await repeat.fill(password);
  await save.click();
  await expect(page.getByText('رمز عبور فعلی درست نیست.')).toBeVisible();
  await expect(current).toBeFocused();

  await current.fill(account.password);
  await save.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'رمز عبور عوض شد' }),
  ).toBeVisible();
  await expect(next).toHaveCount(0);

  await page.goto('/contacts');
  await (
    await openMenu(page)
  )
    .getByRole('button', { name: 'خروج', exact: true })
    .click();
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
  // The key is explained as something for the authenticator app.
  await expect(
    page.getByText('اسکن نمی‌شه؟ این کلید رو توی اپ احراز هویت وارد کن'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'ادامه', exact: true }).click();
  await expect(
    page.getByText('کد ۶ رقمی‌ای که الان توی اپ احراز هویت می‌بینی رو وارد کن'),
  ).toBeVisible();
  // Pasting the key itself into the code boxes explains the mix-up instead
  // of filling them with the key's digits.
  const first = page.getByRole('textbox', { name: 'رقم ۱', exact: true });
  await first.evaluate(
    (input, key) => {
      const data = new DataTransfer();
      data.setData('text', key);
      input.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true }),
      );
    },
    secret.match(/.{1,4}/g)!.join(' '),
  );
  await expect(page.locator('.form-error')).toContainText(
    'این کلید راه‌اندازیه، نه کد.',
  );
  await expect(first).toHaveValue('');
  await first.fill(fixture<string>({ action: 'totp', secret }));
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

test('a new profile photo is moved and zoomed in the crop window before saving', async ({
  page,
}) => {
  await page.goto('/profile');
  const input = page.locator('.profile-photo input[type="file"]');
  // A wide photo, so there is room to move it sideways.
  const photo = {
    name: 'wide.png',
    mimeType: 'image/png',
    buffer: await sharp({
      create: { width: 900, height: 450, channels: 3, background: '#4a90a4' },
    })
      .png()
      .toBuffer(),
  };
  const dialog = page.getByRole('dialog', { name: 'تنظیم عکس' });
  const preview = page.locator('.profile-photo .photo-current img');

  // Cancel keeps the old photo.
  await input.setInputFiles(photo);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'انصراف' }).click();
  await expect(dialog).toBeHidden();
  await expect(preview).toHaveCount(0);

  await input.setInputFiles(photo);
  const image = dialog.locator('.crop-area img');
  await expect(image).toBeVisible();
  const before = await image.evaluate((el) => el.style.transform);
  const area = dialog.locator('.crop-area');
  const box = (await area.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2);
  await page.mouse.up();
  await expect
    .poll(() => image.evaluate((el) => el.style.transform))
    .not.toBe(before);
  // The keyboard moves it too, and the slider zooms.
  await area.focus();
  await page.keyboard.press('ArrowLeft');
  await dialog.getByRole('slider', { name: 'بزرگ‌نمایی' }).fill('2');
  await dialog.getByRole('button', { name: 'تأیید' }).click();
  await expect(dialog).toBeHidden();
  // Only the circle's square is kept: a 512 × 512 image.
  await expect(preview).toHaveAttribute('src', /^blob:/);
  expect(
    await preview.evaluate((el: HTMLImageElement) => [
      el.naturalWidth,
      el.naturalHeight,
    ]),
  ).toEqual([512, 512]);
});

test('settings list the signed-in devices and sign one out', async ({
  page,
  browser,
  account,
}) => {
  // A second, separate browser (like a private window) on the same account.
  const other = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const phone = await other.newPage();
  await login(phone, account.email, account.password);
  await expect(phone).toHaveURL(/\/contacts$/);

  await page.goto('/settings');
  await page.getByRole('button', { name: /خروج از همه‌ی دستگاه‌ها/ }).click();
  const devices = page.getByRole('list', { name: 'دستگاه‌های واردشده' });
  const rows = devices.getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('این دستگاه');
  await expect(rows.first()).toContainText('الان فعال');
  const iphone = rows.filter({ hasText: 'Safari روی iOS' });
  await expect(iphone).toHaveCount(1);
  // Only other devices get their own sign-out button.
  await expect(rows.first().getByRole('button')).toHaveCount(0);
  await iphone.getByRole('button', { name: 'خروج از Safari روی iOS' }).click();
  await expect(rows).toHaveCount(1);

  // With the card still open, a new sign-in elsewhere shows up when this
  // tab comes back into focus, without reloading the page.
  const third = await browser.newContext();
  const laptop = await third.newPage();
  await login(laptop, account.email, account.password);
  await expect(laptop).toHaveURL(/\/contacts$/);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(rows).toHaveCount(2);
  await third.close();

  // That browser is signed out; this one is not.
  await phone.goto('/contacts');
  await expect(phone).toHaveURL(/\/login$/);
  await page.reload();
  await expect(page).toHaveURL(/\/settings$/);
  await other.close();
});
