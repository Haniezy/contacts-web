import { expect, fixture, test } from './fixtures';

test.beforeEach(async ({ context, account }) => {
  fixture({
    action: 'contacts',
    email: account.email,
    contacts: [
      { name: 'آرش محمدی', phone: '09121112233' },
      { name: 'آیدا کریمی', phone: '09122223344' },
      {
        name: 'بهار رضایی',
        phone: '09123456789',
        birthday: '1996-10-06',
        reminder: 'پنجشنبه زنگ بزن',
      },
      { name: 'سارا احمدی', phone: '09126667788' },
      { name: 'سارا احمدی', phone: '09126667788' },
    ],
  });
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

test('list is grouped alphabetically, searchable, and rows open their actions', async ({
  page,
  isMobile,
}) => {
  await page.goto('/contacts');
  await expect(page.locator('.count-chip').first()).toHaveText('۵ نفر');
  await expect(page.locator('.letter-chip')).toHaveText(['آ', 'ب', 'س']);
  const search = page.getByRole('searchbox', { name: 'جستجوی نام یا شماره' });
  await search.fill('سارا');
  await expect(page.locator('.contact-row')).toHaveCount(2);
  await search.fill('۰۹۱۲۳۴۵');
  await expect(page.locator('.contact-row')).toHaveCount(1);
  await search.fill('نیست');
  await expect(page.getByText('مخاطبی پیدا نشد.')).toBeVisible();
  await search.fill('');
  await expect(page.locator('.contact-row')).toHaveCount(5);

  const toggle = page.getByRole('button', { name: 'بهار رضایی' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const row = page.locator('.contact-row.is-open');
  await expect(row.getByRole('link', { name: 'تماس' })).toHaveAttribute(
    'href',
    'tel:09123456789',
  );
  await expect(row.getByRole('link', { name: 'پیامک' })).toHaveAttribute(
    'href',
    'sms:09123456789',
  );
  if (isMobile) {
    await expect(
      page.getByRole('link', { name: 'جزئیات بهار رضایی' }),
    ).toHaveAttribute('href', /\/contacts\/[0-9a-f-]{36}$/);
  } else {
    const panel = page.locator('.contact-panel');
    await expect(
      panel.getByRole('heading', { name: 'بهار رضایی' }),
    ).toBeVisible();
    await expect(panel.getByText('۱۵ مهر ۱۳۷۵')).toBeVisible();
    await expect(panel.getByText('۰۹۱۲ ۳۴۵ ۶۷۸۹')).toBeVisible();
  }
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('delete asks for confirmation and removes the contact for real', async ({
  page,
}) => {
  await page.goto('/contacts');
  await page.getByRole('button', { name: 'آرش محمدی' }).click();
  const row = page.locator('.contact-row.is-open');
  await row.getByRole('button', { name: 'حذف' }).click();
  const dialog = page.getByRole('dialog', { name: 'حذف «آرش محمدی»؟' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'انصراف' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.contact-row')).toHaveCount(5);

  await row.getByRole('button', { name: 'حذف' }).click();
  await dialog.getByRole('button', { name: 'حذف', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'آرش محمدی' })).toHaveCount(0);
  await expect(page.locator('.count-chip').first()).toHaveText('۴ نفر');
  await page.reload();
  await expect(page.locator('.contact-row')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'آرش محمدی' })).toHaveCount(0);
});

test('duplicates are counted in the menu and the empty panel', async ({
  page,
  isMobile,
}) => {
  await page.goto('/contacts');
  if (!isMobile)
    await expect(page.getByText('۲ مخاطب تکراری پیدا شد')).toBeVisible();
  await page
    .getByRole('button', { name: isMobile ? 'منو' : 'حساب کاربری' })
    .click();
  const menu = page.getByRole('dialog', { name: 'منو' });
  await expect(
    menu.getByRole('link', { name: /ادغام تکراری‌ها/ }),
  ).toContainText('۲');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('deleting through the BFF is owner-scoped and needs a trusted origin', async ({
  page,
  request,
}) => {
  await page.goto('/contacts');
  const missing = await page.evaluate(async () => {
    const response = await fetch(
      '/api/contacts/00000000-0000-4000-8000-000000000000',
      { method: 'DELETE' },
    );
    return response.status;
  });
  expect(missing).toBe(404);
  const crossSite = await request.delete(
    '/api/contacts/00000000-0000-4000-8000-000000000000',
    { headers: { Origin: 'https://other.example' } },
  );
  expect(crossSite.status()).toBe(403);
});
