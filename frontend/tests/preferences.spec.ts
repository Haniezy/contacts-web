import { expect, test } from '@playwright/test';

test('theme and language persist, retain physical knob positions and translate the document', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  const html = page.locator('html');
  const toggle = page.getByRole('switch');
  await expect(html).toHaveAttribute('lang', 'fa');
  await expect(html).toHaveAttribute('dir', 'rtl');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(
    page.getByRole('heading', { name: 'دفترچه تلفن' }),
  ).toBeVisible();
  await expect(toggle).toBeEnabled();
  await expect(page.locator('.theme-knob')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 32, 0)',
  );
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.theme-knob')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 0, 0)',
  );
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(html).toHaveAttribute('lang', 'en');
  await expect(html).toHaveAttribute('dir', 'ltr');
  await expect(
    page.getByRole('heading', { name: 'Contacts', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(html).toHaveAttribute('dir', 'ltr');
  await expect(toggle).toBeChecked();
  await expect(
    page.getByRole('button', { name: 'English', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(page.locator('.theme-knob')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 32, 0)',
  );
  await page.getByRole('button', { name: 'فارسی', exact: true }).click();
  await expect(html).toHaveAttribute('dir', 'rtl');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(html).toHaveAttribute('lang', 'fa');
  await expect(toggle).not.toBeChecked();
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
  await page.goto('/');
  const toggle = page.getByRole('switch');
  await expect(toggle).toBeEnabled();
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toBeChecked();
  await expect(page.locator('.theme-knob')).toHaveCSS(
    'transition-duration',
    '0s',
  );
  await page.getByRole('button', { name: 'English', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});
