import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect, fixture, openMenu } from './fixtures';

// Logout lives in the drawer (mobile) or the account dropdown (desktop).
async function logout(page: Page) {
  await openMenu(page);
  await page.getByRole('button', { name: 'خروج', exact: true }).click();
}

test('landing → signup → QR → verification → recovery codes → contacts; two-factor login rejects invalid codes', async ({
  page,
  context,
}) => {
  const email = `browser-test-${randomUUID()}@contacts.example`;
  const password = 'Browser test 12!';
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
    // Copying the setup key says so on that button only.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'کپی کلید راه‌اندازی' }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(secret);
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
    // The codes' copy button starts fresh (not "copied" from the key) and
    // says so once it has copied all ten.
    const copyCodes = page.getByRole('button', {
      name: /کپی کدها|کدها کپی شد/,
    });
    await expect(copyCodes).toHaveText('کپی کدها');
    await copyCodes.click();
    await expect(copyCodes).toHaveText('کدها کپی شد');
    expect(
      (await page.evaluate(() => navigator.clipboard.readText())).split('\n'),
    ).toEqual(await page.locator('.recovery-codes code').allInnerTexts());
    await expect(copyCodes).toHaveText('کپی کدها', { timeout: 5000 });
    const recovery = await page
      .locator('.recovery-codes code')
      .first()
      .innerText();
    await page.getByRole('checkbox').check();
    await page
      .getByRole('link', { name: 'ورود به مخاطبین', exact: true })
      .click();
    await expect(page).toHaveURL(/\/contacts$/);
    await expect(
      page.getByRole('heading', { name: 'هنوز مخاطبی نداری' }),
    ).toBeVisible();
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
    await expect(
      page.getByRole('heading', { name: 'هنوز مخاطبی نداری' }),
    ).toBeVisible();
  } finally {
    fixture({ action: 'delete', email });
  }
});

test('a signed-in visitor gets one button into the book on the landing page', async ({
  page,
  context,
  account,
}) => {
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
  await page.goto('/');
  const actions = page.locator('.landing-actions');
  await expect(actions.getByRole('link')).toHaveCount(1);
  await actions.getByRole('link', { name: 'ورود به دفترچه' }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await logout(page);
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(
    actions.getByRole('link', { name: 'ساخت حساب', exact: true }),
  ).toBeVisible();
  await expect(
    actions.getByRole('link', { name: 'ورود', exact: true }),
  ).toBeVisible();
});

test('a contact link opened while signed out returns to that contact after login', async ({
  page,
  context,
  account,
}) => {
  fixture({
    action: 'contacts',
    email: account.email,
    contacts: [{ name: 'بهار رضایی', phone: '09123456789' }],
  });
  const session = {
    name: 'contacts_session',
    value: account.token,
    domain: '127.0.0.1',
    path: '/',
  };
  await context.addCookies([session]);
  const { contacts } = await (await page.request.get('/api/contacts')).json();
  const path = `/contacts/${contacts[0].id}`;
  await context.clearCookies();
  await page.goto(path);
  await expect(page).toHaveURL(`/login?${new URLSearchParams({ next: path })}`);
  await page.getByLabel('ایمیل', { exact: true }).fill(account.email);
  await page.getByLabel('رمز عبور', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  await expect(page).toHaveURL(path);
  await expect(page.getByRole('heading', { name: 'بهار رضایی' })).toBeVisible();
  // Only the app's own pages are accepted as a place to return to.
  await page.goto('/login?next=//evil.example');
  await expect(page).toHaveURL(/\/contacts$/);
});

test('login and signup lead back to the landing page', async ({ page }) => {
  for (const path of ['/login', '/signup']) {
    await page.goto(path);
    await page.getByRole('link', { name: 'بازگشت به صفحه اصلی' }).click();
    await expect(page).toHaveURL(/\/$/);
  }
});

test('landing sections: FAQ opens one answer at a time; footer switches theme and language with one click', async ({
  page,
}) => {
  await page.goto('/');
  for (const name of [
    'هر چیزی که یه دفترچه تلفن لازم داره',
    'امنیت و حریم خصوصی',
    'سوالات متداول',
    'درباره دفترچه',
  ])
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  const first = page.getByRole('button', { name: 'دفترچه چیه؟' });
  const second = page.getByRole('button', {
    name: 'روی گوشی هم کار می‌کنه؟',
  });
  await first.click();
  await expect(first).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('region', { name: 'دفترچه چیه؟' })).toHaveCSS(
    'opacity',
    '1',
  );
  await second.click();
  await expect(second).toHaveAttribute('aria-expanded', 'true');
  await expect(first).toHaveAttribute('aria-expanded', 'false');
  await second.click();
  await expect(second).toHaveAttribute('aria-expanded', 'false');
  const footer = page.locator('footer');
  await expect(footer.getByText('نسخه‌ی ۱.۰.۰')).toBeVisible();
  await expect(footer.getByRole('link')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: /@gmail\.com$/ }),
  ).toHaveAttribute('href', /^mailto:/);
  const html = page.locator('html');
  const toggle = footer.getByRole('switch');
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  // Clicking the side already showing the language still flips it.
  await footer.locator('.language-option.is-active').click();
  await expect(html).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Frequently asked questions' }),
  ).toBeVisible();
  await footer.getByRole('button', { name: 'فارسی', exact: true }).click();
  await expect(html).toHaveAttribute('lang', 'fa');
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

  // Signup rules: names of 2–16 and 2–28 characters, passwords of 6–16, and
  // a misspelt popular mail domain is caught with a one-click fix.
  await page.getByLabel('نام', { exact: true }).fill('س');
  await page.getByLabel('نام خانوادگی', { exact: true }).fill('ا');
  await page.getByLabel('ایمیل', { exact: true }).fill('sara@gmial.com');
  await page.getByLabel('رمز عبور', { exact: true }).fill('12345');
  await page.getByRole('button', { name: 'ساخت حساب', exact: true }).click();
  await expect(
    page.getByText('نام باید بین ۲ تا ۱۶ کاراکتر باشه.'),
  ).toBeVisible();
  await expect(
    page.getByText('نام خانوادگی باید بین ۲ تا ۲۸ کاراکتر باشه.'),
  ).toBeVisible();
  await expect(
    page.getByText('رمز عبور باید بین ۶ تا ۱۶ کاراکتر باشه.'),
  ).toBeVisible();
  await expect(page.getByText('منظورت sara@gmail.com بود؟')).toBeVisible();
  await page.getByRole('button', { name: 'sara@gmail.com' }).click();
  await expect(page.getByLabel('ایمیل', { exact: true })).toHaveValue(
    'sara@gmail.com',
  );
  await expect(page.getByText('منظورت sara@gmail.com بود؟')).toHaveCount(0);
  await expect(page.getByLabel('رمز عبور', { exact: true })).toHaveAttribute(
    'maxlength',
    '16',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
