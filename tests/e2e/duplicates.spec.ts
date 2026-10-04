import { expect, fixture, test } from './fixtures';

test.beforeEach(async ({ context, account }) => {
  fixture({
    action: 'contacts',
    email: account.email,
    contacts: [
      { name: 'بهار رضایی', phone: '09123456789', birthday: '1996-10-06' },
      {
        name: 'بهار.ر نوری',
        phone: '+989123456789',
        reminder: 'قرار قهوه پنجشنبه',
      },
      { name: 'آرش محمدی', phone: '09121112233' },
      { name: 'آرش م', phone: '9121112233' },
      { name: 'پریسا احمدی', phone: '09125556677' },
      // Same name (written differently), different numbers.
      { name: 'سارا احمدی', phone: '09351110000' },
      { name: 'سارا  احمدي', phone: '09361110000' },
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

const card = (page: import('@playwright/test').Page, name: string) =>
  page.locator('.duplicate-card', { hasText: name });

test('merging keeps one complete record with the chosen fields', async ({
  page,
  isMobile,
}) => {
  await page.goto('/contacts');
  await page
    .getByRole('button', { name: isMobile ? 'منو' : 'حساب کاربری' })
    .click();
  const link = page
    .getByRole('dialog', { name: 'منو' })
    .getByRole('link', { name: /ادغام تکراری‌ها/ });
  // The badge counts groups: two phone groups and one name group.
  await expect(link).toContainText('۳');
  await link.click();
  await expect(page).toHaveURL(/\/contacts\/duplicates$/);
  await expect(
    page.getByText('۳ گروه پیدا شد که ممکنه یک نفر باشن'),
  ).toBeVisible();
  await expect(page.locator('.duplicate-card')).toHaveCount(3);

  await card(page, 'بهار رضایی')
    .getByRole('button', { name: 'بررسی و ادغام' })
    .click();
  await expect(page).toHaveURL(/\/contacts\/duplicates\/merge\?ids=/);
  const dialog = page.getByRole('dialog', { name: 'ادغام مخاطب' });
  await expect(dialog).toBeVisible();
  // Optional fields default to the version that has a value.
  await expect(
    dialog.getByRole('radio', { name: '۱۵ مهر ۱۳۷۵' }),
  ).toBeChecked();
  await expect(
    dialog.getByRole('radio', { name: 'قرار قهوه پنجشنبه' }),
  ).toBeChecked();
  await dialog.locator('.merge-option', { hasText: 'بهار رضایی' }).click();
  await expect(dialog.getByRole('radio', { name: 'بهار رضایی' })).toBeChecked();
  await dialog.locator('.merge-option', { hasText: '۰۹۱۲ ۳۴۵ ۶۷۸۹' }).click();
  await dialog.getByRole('button', { name: 'ادغام نهایی' }).click();

  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/contacts\/duplicates$/);
  await expect(page.locator('.duplicate-card')).toHaveCount(2);
  await expect(
    page.getByText('۲ گروه پیدا شد که ممکنه یک نفر باشن'),
  ).toBeVisible();

  // The browser's back button must not show the contacts page from before.
  await page.goBack();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(page.locator('.count-chip').first()).toHaveText('۶ نفر');
  if (!isMobile)
    await expect(page.getByText('۲ گروه تکراری پیدا شد')).toBeVisible();
  await expect(page.getByRole('button', { name: 'بهار.ر نوری' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'بهار رضایی' }).click();
  const edit = page
    .locator('.contact-row.is-open')
    .getByRole('link', { name: 'ویرایش' });
  await page.goto((await edit.getAttribute('href'))!);
  await expect(page.getByLabel('شماره تلفن')).toHaveValue('۰۹۱۲ ۳۴۵ ۶۷۸۹');
  await expect(page.getByLabel(/تاریخ تولد/)).toHaveValue('۱۵ مهر ۱۳۷۵');
  await expect(page.getByLabel(/یادآوری/)).toHaveValue('قرار قهوه پنجشنبه');
});

test('ignore hides a group; back, Escape and cancel leave the merge view', async ({
  page,
}) => {
  await page.goto('/contacts/duplicates');
  const dialog = page.getByRole('dialog', { name: 'ادغام مخاطب' });
  const review = card(page, 'آرش محمدی').getByRole('button', {
    name: 'بررسی و ادغام',
  });
  await review.click();
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/contacts\/duplicates$/);
  await page.goForward();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/contacts\/duplicates$/);
  await review.click();
  await dialog.getByRole('button', { name: 'انصراف' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.duplicate-card')).toHaveCount(3);

  await card(page, 'آرش محمدی')
    .getByRole('button', { name: 'نادیده بگیر' })
    .click();
  await expect(page.locator('.duplicate-card')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.duplicate-card')).toHaveCount(2);
  await expect(card(page, 'آرش محمدی')).toHaveCount(0);

  // A merge address for a group that no longer shows goes back to the list.
  await page.goto(
    '/contacts/duplicates/merge?ids=00000000-0000-4000-8000-000000000000',
  );
  await expect(page).toHaveURL(/\/contacts\/duplicates$/);
  await expect(dialog).toBeHidden();
});

test('contacts with the same name merge too, keeping the chosen number', async ({
  page,
}) => {
  await page.goto('/contacts/duplicates');
  const group = card(page, '۰۹۳۵ ۱۱۱ ۰۰۰۰');
  await expect(group).toContainText('۰۹۳۶ ۱۱۱ ۰۰۰۰');
  await group.getByRole('button', { name: 'بررسی و ادغام' }).click();
  const dialog = page.getByRole('dialog', { name: 'ادغام مخاطب' });
  // Neither version has a birthday: one fixed choice, nothing to pick.
  const birthday = dialog
    .getByRole('group', { name: 'تاریخ تولد' })
    .getByRole('radio');
  await expect(birthday).toHaveCount(1);
  await expect(birthday).toBeChecked();
  await expect(birthday).toBeDisabled();
  await dialog.locator('.merge-option', { hasText: 'سارا احمدی' }).click();
  await dialog.locator('.merge-option', { hasText: '۰۹۳۶ ۱۱۱ ۰۰۰۰' }).click();
  await dialog.getByRole('button', { name: 'ادغام نهایی' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.duplicate-card')).toHaveCount(2);
  await expect(card(page, '۰۹۳۵ ۱۱۱ ۰۰۰۰')).toHaveCount(0);

  await page.goto('/contacts');
  await expect(page.getByRole('button', { name: /^سارا/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'سارا احمدی' }).click();
  const edit = page
    .locator('.contact-row.is-open')
    .getByRole('link', { name: 'ویرایش' });
  await page.goto((await edit.getAttribute('href'))!);
  await expect(page.getByLabel('شماره تلفن')).toHaveValue('۰۹۳۶ ۱۱۱ ۰۰۰۰');
});
