import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// The switches live in the menu: the drawer on mobile, the account
// dropdown on desktop.
async function preferences(page: Page) {
  // Wait for the contacts header.
  await page.locator('.contacts-search').waitFor();
  await page
    .getByRole('button', { name: /^(منو|Menu|حساب کاربری|Account)$/ })
    .filter({ visible: true })
    .click();
  return page.getByRole('dialog');
}

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

test('theme and language persist, retain physical knob positions and translate the document', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/contacts');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', 'fa');
  await expect(html).toHaveAttribute('dir', 'rtl');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('heading', { name: 'مخاطبین' })).toBeVisible();
  let scope = await preferences(page);
  let toggle = scope.getByRole('switch');
  await expect(toggle).toBeEnabled();
  await expect(scope.locator('.theme-knob')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 28, 0)',
  );
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(scope.locator('.theme-knob')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 0, 0)',
  );
  await scope.getByRole('button', { name: 'English', exact: true }).click();
  await expect(html).toHaveAttribute('lang', 'en');
  await expect(html).toHaveAttribute('dir', 'ltr');
  await expect(
    page.getByRole('heading', { name: 'Contacts', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(html).toHaveAttribute('dir', 'ltr');
  scope = await preferences(page);
  toggle = scope.getByRole('switch');
  await expect(toggle).toBeChecked();
  // One button: in English it offers Persian, with the knob under EN.
  await expect(scope.locator('.language-option.is-active')).toHaveText('EN');
  await expect(
    scope.getByRole('button', { name: 'English', exact: true }),
  ).toHaveCount(0);
  await toggle.click();
  await expect(scope.locator('.theme-knob')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 28, 0)',
  );
  await scope.getByRole('button', { name: 'فارسی', exact: true }).click();
  await expect(html).toHaveAttribute('dir', 'rtl');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(html).toHaveAttribute('lang', 'fa');
  scope = await preferences(page);
  await expect(scope.getByRole('switch')).not.toBeChecked();
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() =>
      document.fonts.check('400 16px Vazirmatn', 'دفترچه Contacts'),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('cookie renders correct language on the server; invalid values fall back to Persian', async ({
  context,
  request,
}) => {
  await context.addCookies([
    { name: 'contacts-locale', value: 'en', domain: '127.0.0.1', path: '/' },
  ]);
  const english = await context.request.get('/');
  expect(await english.text()).toContain('lang="en" dir="ltr"');
  const invalid = await request.get('/', {
    headers: { Cookie: 'contacts-locale=invalid' },
  });
  expect(await invalid.text()).toContain('lang="fa" dir="rtl"');
});

test('keyboard controls and reduced motion work', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/contacts');
  const scope = await preferences(page);
  const toggle = scope.getByRole('switch');
  await expect(toggle).toBeEnabled();
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toBeChecked();
  await expect(scope.locator('.theme-knob')).toHaveCSS(
    'transition-duration',
    '0s',
  );
  await scope.getByRole('button', { name: 'English', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});
