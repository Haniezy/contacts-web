import type { Page } from '@playwright/test';
import {
  detailsHref,
  editChosen,
  expect,
  fixture,
  isDesk,
  openMenu,
  rows,
  test,
} from './fixtures';

test.beforeEach(async ({ context, account }) => {
  fixture({
    action: 'contacts',
    email: account.email,
    contacts: [
      { name: 'آرش محمدی', phone: '09121112233' },
      { name: 'بهار رضایی', phone: '09123456789' },
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

const defaults = ['خانواده', 'دوستان', 'همکاران', 'دانشگاه', 'سایر'];
// The tags in the sidebar: always there on desktop, in the drawer from
// «منو» on phones and tablets (which closes once one is chosen).
const filter = async (page: Page, name: string) =>
  (await openMenu(page))
    .locator('.desk-tags')
    .getByRole('button', { name, exact: true })
    .click();
// Everyone again: «Contacts» in the sidebar, or the chosen tag's × above
// the phone list.
async function everyone(page: Page, tag: string) {
  if (isDesk(page))
    await page
      .locator('.desk-sidebar')
      .getByRole('link', { name: /مخاطبین/ })
      .first()
      .click();
  else
    await page
      .getByRole('button', { name: `نمایش همه، نه فقط «${tag}»` })
      .click();
}

test('a new book has the default tags; the form gives them; the list shows one tag', async ({
  page,
}) => {
  await page.goto('/contacts');
  const menu = await openMenu(page);
  await expect(menu.locator('.desk-tag .desk-nav-item')).toHaveText(defaults);
  if (!isDesk(page)) await page.keyboard.press('Escape');

  // The form gives a contact tags.
  await page.getByRole('button', { name: /بهار رضایی/ }).click();
  await editChosen(page);
  const picker = page.locator('.tag-picker');
  await picker.getByRole('button', { name: 'خانواده' }).click();
  await picker.getByRole('button', { name: 'دوستان' }).click();
  await expect(picker.getByRole('button', { name: 'خانواده' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  await expect(page).toHaveURL(/\/contacts$/);

  // Its details show them: beside the list, or on its own page.
  const chips = isDesk(page)
    ? page.locator('.desk-sheet .tag-chip')
    : page.locator('.info-tags-card .tag-chip');
  if (!isDesk(page)) await page.goto(await detailsHref(page, 'بهار رضایی'));
  await expect(chips).toHaveText(['خانواده', 'دوستان']);
  if (!isDesk(page)) await page.goto('/contacts');

  // One tag's contacts; then everyone again.
  await filter(page, 'خانواده');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('بهار رضایی');
  if (isDesk(page))
    await expect(page.locator('#desk-list-title')).toContainText('خانواده');
  await filter(page, 'همکاران');
  await expect(
    page.getByText('هیچ مخاطبی این برچسب رو نداره.').filter({ visible: true }),
  ).toBeVisible();
  await everyone(page, 'همکاران');
  await expect(rows(page)).toHaveCount(3);

  // The form leaves a tag off again.
  await page.getByRole('button', { name: /بهار رضایی/ }).click();
  await editChosen(page);
  await picker.getByRole('button', { name: 'دوستان' }).click();
  await page.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await filter(page, 'دوستان');
  await expect(rows(page)).toHaveCount(0);
});

test('desktop: tags are made, changed and deleted in the sidebar, and given from the details', async ({
  page,
}) => {
  test.skip(!isDesk(page), 'The sidebar and details panel are desktop only.');
  await page.goto('/contacts');
  const sidebar = page.locator('.desk-tags');
  const dialog = page.getByRole('dialog');

  // A new tag, in a colour of its own; a name in use is refused.
  await page.getByRole('button', { name: 'برچسب جدید' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'برچسب جدید' }),
  ).toBeVisible();
  await dialog.getByLabel('نام برچسب').fill('باشگاه');
  await dialog.getByRole('radio', { name: 'فیروزه‌ای' }).check();
  await dialog.getByRole('button', { name: 'ذخیره برچسب' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    sidebar.getByRole('button', { name: 'باشگاه', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'برچسب جدید' }).click();
  await dialog.getByLabel('نام برچسب').fill('خانواده');
  await dialog.getByRole('button', { name: 'ذخیره برچسب' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('برچسبی با این اسم داری.');
  await dialog.getByRole('button', { name: 'انصراف' }).click();
  await expect(dialog).toBeHidden();

  // Given from the details' «+», taken off with its ×.
  await page.getByRole('button', { name: /آرش محمدی/ }).click();
  const sheet = page.locator('.desk-sheet');
  await sheet.getByRole('button', { name: 'افزودن برچسب' }).click();
  // Shown at once; saved once the server answers.
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      /\/api\/contacts\/[0-9a-f-]{36}$/.test(response.url()),
  );
  await page.getByRole('menuitemcheckbox', { name: 'باشگاه' }).click();
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'باشگاه' }),
  ).toHaveAttribute('aria-checked', 'true');
  expect((await saved).ok()).toBe(true);
  await page.keyboard.press('Escape');
  await expect(sheet.locator('.tag-chip')).toHaveText(['باشگاه']);
  await page.reload();
  await page.getByRole('button', { name: /آرش محمدی/ }).click();
  await expect(sheet.locator('.tag-chip')).toHaveText(['باشگاه']);
  await sheet.getByRole('button', { name: 'برداشتن برچسب باشگاه' }).click();
  await expect(sheet.locator('.tag-chip')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'افزودن برچسب' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'باشگاه' }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // Renamed and recoloured: the contact keeps it under the new name.
  await sidebar.getByRole('button', { name: 'گزینه‌های برچسب باشگاه' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'ویرایش برچسب' }),
  ).toBeVisible();
  await expect(dialog.getByLabel('نام برچسب')).toHaveValue('باشگاه');
  await expect(dialog.getByRole('radio', { name: 'فیروزه‌ای' })).toBeChecked();
  await dialog.getByLabel('نام برچسب').fill('ورزش');
  await dialog.getByRole('radio', { name: 'صورتی' }).check();
  await dialog.getByRole('button', { name: 'ذخیره برچسب' }).click();
  await expect(
    sidebar.getByRole('button', { name: 'ورزش', exact: true }),
  ).toBeVisible();
  await sidebar.getByRole('button', { name: 'ورزش', exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('آرش محمدی');

  // Deleted (it asks first): off the contact, and the whole book shows.
  await sidebar.getByRole('button', { name: 'گزینه‌های برچسب ورزش' }).click();
  await dialog.getByRole('button', { name: 'حذف برچسب' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'برچسب «ورزش» حذف بشه؟' }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'حذف', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    sidebar.getByRole('button', { name: 'ورزش', exact: true }),
  ).toHaveCount(0);
  await expect(rows(page)).toHaveCount(3);
  await page.getByRole('button', { name: /آرش محمدی/ }).click();
  await expect(sheet.locator('.tag-chip')).toHaveCount(0);
});
