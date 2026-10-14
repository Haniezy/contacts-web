import type { Page } from '@playwright/test';
import { expect, isDesk, test } from './fixtures';

// Phones and tablets: the language switch and the theme buttons in the
// drawer from «منو». Desktop: the language switch in the sidebar, the theme
// buttons in the top bar. The moon first, then the sun.
async function preferences(page: Page) {
  // Wait for the contacts page.
  await page.getByRole('searchbox').waitFor();
  if (isDesk(page)) return page.getByRole('complementary');
  await page.getByRole('button', { name: /^(منو|Menu)$/ }).click();
  return page.getByRole('dialog');
}
// The closed drawer has them too on desktop; only the shown ones count.
const themeButton = (page: Page, dark: boolean) =>
  page
    .locator('.theme-buttons')
    .filter({ visible: true })
    .locator('button')
    .nth(dark ? 0 : 1);
async function setDark(page: Page, dark: boolean) {
  await themeButton(page, dark).click();
  await expectDark(page, dark);
}
async function expectDark(page: Page, dark: boolean) {
  await expect(themeButton(page, dark)).toHaveAttribute('aria-pressed', 'true');
  await expect(themeButton(page, !dark)).toHaveAttribute(
    'aria-pressed',
    'false',
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

test('theme and language persist and translate the document', async ({
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
  await expectDark(page, false);
  await setDark(page, true);
  await expect(html).toHaveAttribute('data-theme', 'dark');
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
  await expectDark(page, true);
  // One button, named after the language it offers: in English, Persian.
  await expect(
    scope.getByRole('button', { name: 'فارسی', exact: true }),
  ).toHaveAttribute('lang', 'fa');
  await expect(
    scope.getByRole('button', { name: 'English', exact: true }),
  ).toHaveCount(0);
  await setDark(page, false);
  await scope.getByRole('button', { name: 'فارسی', exact: true }).click();
  await expect(html).toHaveAttribute('dir', 'rtl');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(html).toHaveAttribute('lang', 'fa');
  scope = await preferences(page);
  await expectDark(page, false);
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
  const moon = themeButton(page, true);
  await moon.focus();
  await page.keyboard.press('Enter');
  await expect(moon).toHaveAttribute('aria-pressed', 'true');
  await expect(moon).toHaveCSS('transition-duration', '0s');
  await scope.getByRole('button', { name: 'English', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('a colour theme chosen in Settings covers the whole app and stays', async ({
  page,
}) => {
  await page.goto('/settings');
  const html = page.locator('html');
  const themes = page.getByRole('group', { name: 'تم رنگی' });
  // Slate blue unless another is chosen.
  await expect(html).toHaveAttribute('data-palette', 'slate');
  await expect(themes.getByRole('radio', { name: 'آبی سنگی' })).toBeChecked();
  const accent = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--primary')
        .trim(),
    );
  expect(await accent()).toBe('#2f6feb');

  // Applied at once, kept across a reload and on other pages.
  await themes.getByRole('radio', { name: 'سفالی' }).check();
  await expect(html).toHaveAttribute('data-palette', 'terracotta');
  expect(await accent()).toBe('#b85c46');
  await page.reload();
  await expect(html).toHaveAttribute('data-palette', 'terracotta');
  await expect(themes.getByRole('radio', { name: 'سفالی' })).toBeChecked();
  await page.goto('/contacts');
  await expect(html).toHaveAttribute('data-palette', 'terracotta');

  // Each theme has its dark mode too.
  await page.evaluate(() => localStorage.setItem('contacts-theme', 'dark'));
  await page.goto('/settings');
  await themes.getByRole('radio', { name: 'سبز جنگلی' }).check();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await accent()).toBe('#98704b');
  await themes.getByRole('radio', { name: 'آبی سنگی' }).check();
  expect(await accent()).toBe('#6ea8fe');
});
