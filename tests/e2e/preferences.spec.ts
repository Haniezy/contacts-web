import type { Locator, Page } from '@playwright/test';
import { expect, isDesk, test } from './fixtures';

// Phones and tablets: both switches in the drawer from «منو». Desktop: the
// language switch in the sidebar, the theme as two buttons in the top bar
// (the moon first).
async function preferences(page: Page) {
  // Wait for the contacts page.
  await page.getByRole('searchbox').waitFor();
  if (isDesk(page)) return page.getByRole('complementary');
  await page.getByRole('button', { name: /^(منو|Menu)$/ }).click();
  return page.getByRole('dialog');
}
const themeButton = (page: Page, dark: boolean) =>
  page.locator('.theme-buttons button').nth(dark ? 0 : 1);
async function setDark(page: Page, scope: Locator, dark: boolean) {
  if (isDesk(page)) {
    await themeButton(page, dark).click();
    await expect(themeButton(page, dark)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  } else {
    await scope.getByRole('switch').click();
    await expect(scope.getByRole('switch')).toBeChecked({ checked: dark });
  }
}
async function expectDark(page: Page, scope: Locator, dark: boolean) {
  if (isDesk(page))
    await expect(themeButton(page, dark)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  else await expect(scope.getByRole('switch')).toBeChecked({ checked: dark });
}
// The switch's knob, on phones and tablets.
async function knob(page: Page, scope: Locator, x: number) {
  if (isDesk(page)) return;
  await expect(scope.locator('.theme-knob')).toHaveCSS(
    'transform',
    `matrix(1, 0, 0, 1, ${x}, 0)`,
  );
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
  await knob(page, scope, 28);
  await setDark(page, scope, true);
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await knob(page, scope, 0);
  await scope.getByRole('button', { name: 'English', exact: true }).click();
  await expect(html).toHaveAttribute('lang', 'en');
  await expect(html).toHaveAttribute('dir', 'ltr');
  // Desktop titles the list «All contacts (n)».
  await expect(
    isDesk(page)
      ? page.getByRole('heading', { level: 1, name: /^All contacts/ })
      : page.getByRole('heading', { name: 'Contacts', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(html).toHaveAttribute('dir', 'ltr');
  scope = await preferences(page);
  await expectDark(page, scope, true);
  // One button: in English it offers Persian, with the knob under EN.
  await expect(scope.locator('.language-option.is-active')).toHaveText('EN');
  await expect(
    scope.getByRole('button', { name: 'English', exact: true }),
  ).toHaveCount(0);
  await setDark(page, scope, false);
  await knob(page, scope, 28);
  await scope.getByRole('button', { name: 'فارسی', exact: true }).click();
  await expect(html).toHaveAttribute('dir', 'rtl');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(html).toHaveAttribute('lang', 'fa');
  scope = await preferences(page);
  await expectDark(page, scope, false);
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
  if (isDesk(page)) {
    await themeButton(page, true).focus();
    await page.keyboard.press('Enter');
    await expect(themeButton(page, true)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  } else {
    const toggle = scope.getByRole('switch');
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toBeChecked();
    await expect(scope.locator('.theme-knob')).toHaveCSS(
      'transition-duration',
      '0s',
    );
  }
  await scope.getByRole('button', { name: 'English', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});
