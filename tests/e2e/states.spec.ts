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

test('an empty book invites the first contact, which replaces the empty state', async ({
  page,
  isMobile,
}) => {
  await page.goto('/contacts');
  const empty = page.locator('.contacts-blank');
  await expect(
    empty.getByRole('heading', { name: 'هنوز مخاطبی نداری' }),
  ).toBeVisible();
  await expect(
    empty.getByText(
      'با دکمه‌ی پایین اولین مخاطبت رو اضافه کن تا دفترچه‌ت شکل بگیره',
    ),
  ).toBeVisible();
  // The header's add button stays; desktop shows no side panel.
  await expect(page.locator('.contacts-add')).toBeVisible();
  await expect(page.locator('.contact-panel')).toBeHidden();
  if (isMobile)
    await expect(page.locator('.count-chip').first()).toHaveText('۰ نفر');

  await empty.getByRole('link', { name: 'افزودن مخاطب' }).click();
  await expect(page).toHaveURL(/\/contacts\/new$/);
  await expect(page.getByRole('heading', { name: 'مخاطب جدید' })).toBeVisible();
  await page.getByLabel('نام و نام خانوادگی').fill('نگار صالحی');
  await page.getByLabel('شماره تلفن').fill('09121112222');
  await page.getByRole('button', { name: 'ذخیره مخاطب' }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(page.getByRole('button', { name: 'نگار صالحی' })).toBeVisible();
  await expect(empty).toHaveCount(0);
  await expect(page.locator('.contacts-add')).toBeVisible();
  await expect(page.locator('.count-chip').first()).toHaveText('۱ نفر');
});

test('a failed request shows the error toast until a retry succeeds', async ({
  page,
  account,
}) => {
  fixture({
    action: 'contacts',
    email: account.email,
    contacts: [
      { name: 'آرش محمدی', phone: '09121112233' },
      { name: 'بهار رضایی', phone: '09123456789' },
    ],
  });
  await page.goto('/contacts');
  await expect(page.locator('.contact-row')).toHaveCount(2);

  await page.route('**/api/contacts?**', (route) => route.abort());
  await page
    .getByRole('searchbox', { name: 'جستجوی نام یا شماره' })
    .fill('بهار');
  const toast = page.getByRole('alert').filter({ hasText: 'مشکلی پیش اومد' });
  await expect(toast).toBeVisible();
  await expect(
    toast.getByText('اتصال اینترنت رو چک کن و دوباره تلاش کن'),
  ).toBeVisible();
  // The list already shown stays under the toast.
  await expect(page.locator('.contact-row')).toHaveCount(2);

  // Still offline: the retry fails and the toast stays.
  await toast.getByRole('button', { name: 'تلاش مجدد' }).click();
  await expect(toast.getByRole('button', { name: 'تلاش مجدد' })).toBeEnabled();
  await expect(toast).toBeVisible();

  await page.unroute('**/api/contacts?**');
  await toast.getByRole('button', { name: 'تلاش مجدد' }).click();
  await expect(toast).toBeHidden();
  await expect(page.locator('.contact-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'بهار رضایی' })).toBeVisible();
});
