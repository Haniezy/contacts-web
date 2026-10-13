import {
  addButton,
  deleteChosen,
  detailsHref,
  editChosen,
  expect,
  expectCount,
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
}) => {
  await page.goto('/contacts');
  await expectCount(page, '۵');
  // Phones group the list by first letter; desktop lists it in pages.
  if (!isDesk(page))
    await expect(page.locator('.letter-chip')).toHaveText(['آ', 'ب', 'س']);
  const search = page.getByRole('searchbox', { name: 'جستجوی نام یا شماره' });
  await search.fill('سارا');
  await expect(rows(page)).toHaveCount(2);
  await search.fill('۰۹۱۲۳۴۵');
  await expect(rows(page)).toHaveCount(1);
  await search.fill('نیست');
  await expect(
    page.getByText('مخاطبی پیدا نشد.').filter({ visible: true }),
  ).toBeVisible();
  await search.fill('');
  await expect(rows(page)).toHaveCount(5);

  const toggle = page.getByRole('button', { name: 'بهار رضایی' });
  if (isDesk(page)) {
    // Desktop: the row opens the details beside the list.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-current', 'true');
    const sheet = page.locator('.desk-sheet');
    await expect(
      sheet.getByRole('heading', { name: 'بهار رضایی' }),
    ).toBeVisible();
    await expect(sheet.getByText('۱۵ مهر ۱۳۷۵')).toBeVisible();
    await expect(sheet.getByText('۰۹۱۲ ۳۴۵ ۶۷۸۹')).toBeVisible();
    await expect(sheet.getByText('پنجشنبه زنگ بزن')).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'تماس' })).toHaveAttribute(
      'href',
      'tel:09123456789',
    );
    await expect(sheet.getByRole('link', { name: 'پیامک' })).toHaveAttribute(
      'href',
      'sms:09123456789',
    );
    // Its close button and Escape both put it away.
    await sheet.getByRole('button', { name: 'بستن جزئیات' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(toggle).not.toHaveAttribute('aria-current');
    // A contact without a reminder or birthday says so.
    await page.getByRole('button', { name: 'آرش محمدی' }).click();
    await expect(
      sheet.getByRole('heading', { name: 'آرش محمدی' }),
    ).toBeVisible();
    await expect(sheet.locator('.sheet-note p')).toHaveText('—');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    return;
  }
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
  // The reminder shows as a note under the actions.
  const note = row.locator('.row-reminder');
  await expect(note).toBeVisible();
  await expect(note).toContainText('یادآوری');
  await expect(note).toContainText('پنجشنبه زنگ بزن');
  await expect(
    page.getByRole('link', { name: 'جزئیات بهار رضایی' }),
  ).toHaveAttribute('href', /\/contacts\/[0-9a-f-]{36}$/);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  // A contact without a reminder has no note.
  const other = page.getByRole('button', { name: 'آرش محمدی' });
  await other.click();
  await expect(other).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.contact-row.is-open .row-reminder')).toHaveCount(
    0,
  );
});

test('mixed names: the page language script first, then the other, then #; numbers under names', async ({
  page,
  context,
  account,
}) => {
  fixture({
    action: 'contacts',
    email: account.email,
    contacts: [
      { name: 'Hanie', phone: '09120000001' },
      { name: 'Hanie', phone: '09120000002' },
      { name: '۱۲۳ تاکسی', phone: '09120000003' },
      { name: '#دفتر', phone: '09120000004' },
      { name: 'هانیه', phone: '09120000005' },
    ],
  });
  await page.goto('/contacts');
  const chips = page.locator('.letter-chip');
  // Desktop has no letter groups: the names in order (equal names by id).
  const names = page.locator('.desk-row-name');
  if (isDesk(page))
    await expect(names).toHaveText([
      'آرش محمدی',
      'آیدا کریمی',
      'بهار رضایی',
      'سارا احمدی',
      'سارا احمدی',
      'هانیه',
      'Hanie',
      'Hanie',
      /^(۱۲۳ تاکسی|#دفتر)$/,
      /^(۱۲۳ تاکسی|#دفتر)$/,
    ]);
  else await expect(chips).toHaveText(['آ', 'ب', 'س', 'ه\u200d', 'H', '#']);
  // Same-named contacts are told apart by their numbers.
  // (Equal names are ordered by id, so either may come first.)
  const phones = rows(page)
    .filter({ hasText: 'Hanie' })
    .locator(isDesk(page) ? '.desk-row-phone' : '.row-phone');
  await expect(phones).toHaveCount(2);
  expect((await phones.allTextContents()).sort()).toEqual([
    '۰۹۱۲ ۰۰۰ ۰۰۰۱',
    '۰۹۱۲ ۰۰۰ ۰۰۰۲',
  ]);
  await context.addCookies([
    { name: 'contacts-locale', value: 'en', domain: '127.0.0.1', path: '/' },
  ]);
  await page.reload();
  if (isDesk(page)) {
    await expect(names.first()).toHaveText('Hanie');
    await expect(names.nth(2)).toHaveText('آرش محمدی');
  } else await expect(chips).toHaveText(['H', 'آ', 'ب', 'س', 'ه\u200d', '#']);
});

test('delete asks, then moves to the trash with undo; the trash restores, deletes for good and empties', async ({
  page,
}) => {
  await page.goto('/contacts');
  const toast = page.locator('.undo-toast');
  const confirm = page.getByRole('dialog').getByRole('button', {
    name: 'حذف',
    exact: true,
  });
  const trashOpen = async () => {
    await deleteChosen(page);
    await confirm.click();
  };

  // It asks first (cancel keeps it), then the contact goes to the trash
  // and Undo brings it back.
  await page.getByRole('button', { name: /آرش محمدی/ }).click();
  await deleteChosen(page);
  const dialog = page.getByRole('dialog', { name: 'حذف «آرش محمدی»؟' });
  await expect(dialog.getByRole('button', { name: 'انصراف' })).toBeFocused();
  await dialog.getByRole('button', { name: 'انصراف' }).click();
  await expect(dialog).toBeHidden();
  await expect(toast).toHaveCount(0);
  await expect(page.getByRole('button', { name: /آرش محمدی/ })).toBeVisible();
  await trashOpen();
  await expect(toast).toContainText('«آرش محمدی» به سطل زباله رفت');
  await expect(page.getByRole('button', { name: /آرش محمدی/ })).toHaveCount(0);
  await expectCount(page, '۴');
  await toast.getByRole('button', { name: 'بازگردانی' }).click();
  await expect(page.getByRole('button', { name: /آرش محمدی/ })).toBeVisible();
  await expectCount(page, '۵');

  // Two in the trash; the menu shows the count and leads there.
  for (const name of ['آرش محمدی', 'آیدا کریمی']) {
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await trashOpen();
    await expect(toast).toContainText(name);
  }
  const menu = await openMenu(page);
  const trashLink = menu.getByRole('link', { name: /سطل زباله/ });
  await expect(trashLink).toContainText('۲');
  await trashLink.click();
  await expect(page).toHaveURL(/\/contacts\/trash$/);
  await expect(page.getByRole('status')).toContainText('۲ مخاطب توی سطل زباله');
  await expect(page.locator('.trash-card').first()).toContainText(
    '۷ روز تا حذف همیشگی',
  );

  // Restore one; it is back in the book.
  await page.getByRole('button', { name: 'بازگردانی آیدا کریمی' }).click();
  await expect(page.locator('.trash-card')).toHaveCount(1);

  // Deleting for good asks first; cancel keeps it.
  await page.getByRole('button', { name: 'حذف همیشگی آرش محمدی' }).click();
  const forever = page.getByRole('dialog', {
    name: '«آرش محمدی» برای همیشه پاک بشه؟',
  });
  await expect(forever.getByRole('button', { name: 'انصراف' })).toBeFocused();
  await forever.getByRole('button', { name: 'انصراف' }).click();
  await expect(page.locator('.trash-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'حذف همیشگی آرش محمدی' }).click();
  await forever.getByRole('button', { name: 'حذف همیشگی' }).click();
  await expect(page.getByText('سطل زباله خالیه.')).toBeVisible();

  // Empty trash deletes everything in it for good.
  await page.goto('/contacts');
  await expectCount(page, '۴');
  await expect(page.getByRole('button', { name: /آیدا کریمی/ })).toBeVisible();
  await page.getByRole('button', { name: /بهار رضایی/ }).click();
  await trashOpen();
  await expect(toast).toBeVisible();
  await page.goto('/contacts/trash');
  await page.getByRole('button', { name: 'خالی کردن سطل' }).click();
  await page
    .getByRole('dialog', { name: '۱ مخاطب برای همیشه پاک بشن؟' })
    .getByRole('button', { name: 'حذف همیشگی' })
    .click();
  await expect(page.getByText('سطل زباله خالیه.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('سطل زباله خالیه.')).toBeVisible();
});

test('duplicates are counted in the menu and beside the list', async ({
  page,
}) => {
  await page.goto('/contacts');
  if (isDesk(page)) {
    // Desktop: the sidebar's duplicates entry, and no details until a
    // contact is chosen.
    const entry = page
      .locator('.desk-sidebar')
      .getByRole('link', { name: /مخاطبین تکراری/ });
    await expect(entry).toContainText('۱');
    await expect(entry).toHaveAttribute('href', '/contacts/duplicates');
    await expect(page.locator('.desk-panel.is-open')).toHaveCount(0);
  } else {
    const banner = page.locator('.duplicates-banner');
    await expect(banner).toContainText('۱ گروه تکراری پیدا شد');
    await expect(banner).toHaveAttribute('href', '/contacts/duplicates');
  }
  const menu = await openMenu(page);
  await expect(
    menu.getByRole('link', { name: /مخاطبین تکراری/ }),
  ).toContainText('۱');
  // The drawer closes with Escape; the desktop sidebar stays.
  if (!isDesk(page)) {
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  }
});

test('desktop: the list in pages, a sidebar that folds, and the details menu', async ({
  page,
  account,
}) => {
  test.skip(!isDesk(page), 'Phones and tablets scroll one list instead.');
  fixture({
    action: 'contacts',
    email: account.email,
    contacts: Array.from({ length: 8 }, (_, i) => ({
      name: `مهسا ${'ابپتثجچح'[i]}`,
      phone: `0913000000${i}`,
    })),
  });
  await page.goto('/contacts');
  await expectCount(page, '۱۳');
  const pages = page.locator('.desk-pages span');
  const previous = page.getByRole('button', { name: 'صفحه قبل' });
  const next = page.getByRole('button', { name: 'صفحه بعد' });
  await expect(rows(page)).toHaveCount(10);
  await expect(pages).toHaveText('صفحه ۱ از ۲');
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(rows(page)).toHaveCount(3);
  await expect(pages).toHaveText('صفحه ۲ از ۲');
  await expect(next).toBeDisabled();
  // A search starts again from its first page.
  await page
    .getByRole('searchbox', { name: 'جستجوی نام یا شماره' })
    .fill('سارا');
  await expect(rows(page)).toHaveCount(2);
  await expect(pages).toHaveText('صفحه ۱ از ۱');
  await page.getByRole('searchbox', { name: 'جستجوی نام یا شماره' }).fill('');
  await expect(rows(page)).toHaveCount(10);
  await page.getByRole('combobox', { name: 'نمایش' }).selectOption('20');
  await expect(rows(page)).toHaveCount(13);
  await expect(pages).toHaveText('صفحه ۱ از ۱');

  // The sidebar folds to icons and stays folded.
  const sidebar = page.locator('.desk-sidebar');
  await page.getByRole('button', { name: 'جمع کردن منو' }).click();
  await expect(sidebar).toHaveClass(/is-collapsed/);
  await page.reload();
  await expect(sidebar).toHaveClass(/is-collapsed/);
  await page.getByRole('button', { name: 'باز کردن منو' }).click();
  await expect(sidebar).not.toHaveClass(/is-collapsed/);

  // The details' menu: Escape closes the menu only, then the details.
  await page.getByRole('button', { name: 'بهار رضایی' }).click();
  const sheet = page.locator('.desk-sheet');
  await sheet.getByRole('button', { name: 'گزینه‌های بیشتر' }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem')).toHaveText([
    'ویرایش مخاطب',
    'حذف مخاطب',
  ]);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(
    sheet.getByRole('button', { name: 'گزینه‌های بیشتر' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await page.getByRole('button', { name: 'بهار رضایی' }).click();
  await sheet.getByRole('button', { name: 'گزینه‌های بیشتر' }).click();
  await menu.getByRole('menuitem', { name: 'ویرایش مخاطب' }).click();
  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]{36}\/edit$/);
  await expect(page.getByLabel('نام و نام خانوادگی')).toHaveValue('بهار رضایی');
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

test('one form creates and edits a contact', async ({ page }) => {
  await page.goto('/contacts');
  await addButton(page).click();
  await expect(page).toHaveURL(/\/contacts\/new$/);
  await expect(page.getByRole('heading', { name: 'مخاطب جدید' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'افزودن عکس' })).toBeVisible();
  // Mobile shows the form as a page; desktop keeps the list beside it.
  if (isDesk(page)) await expect(page.locator('.desk-list')).toBeVisible();
  else await expect(addButton(page)).toBeHidden();

  await page.getByRole('button', { name: 'ذخیره مخاطب' }).click();
  await expect(
    page.getByText('نام باید بین ۲ تا ۲۸ کاراکتر باشه.'),
  ).toBeVisible();
  await expect(
    page.getByText('شماره معتبر نیست؛ ۳ تا ۱۵ رقم وارد کن.'),
  ).toBeVisible();
  await expect(page.getByLabel('نام و نام خانوادگی')).toBeFocused();

  const name = page.getByLabel('نام و نام خانوادگی');
  await name.fill('ن');
  await name.blur();
  await expect(
    page.getByText('نام باید بین ۲ تا ۲۸ کاراکتر باشه.'),
  ).toBeVisible();
  // Typing stops at 28 characters.
  await name.fill('');
  await name.pressSequentially('ن'.repeat(30));
  await expect(name).toHaveValue('ن'.repeat(28));
  await name.fill('نگار صالحی');
  // Letters never reach the phone or birthday fields.
  const phone = page.getByLabel('شماره تلفن');
  await phone.pressSequentially('۰۹۱۲abc ۱۱۱ ۲۲۲۲ب');
  await expect(phone).toHaveValue('۰۹۱۲ ۱۱۱ ۲۲۲۲');
  const birthday = page.getByLabel(/تاریخ تولد/);
  await birthday.pressSequentially('ab۱۳۸۳۲۳');
  await birthday.blur();
  // Digits without separators are read as a date and tidied on blur.
  await expect(birthday).toHaveValue('۳ اردیبهشت ۱۳۸۳');
  await birthday.focus();
  await expect(birthday).toHaveValue('۳/۲/۱۳۸۳');
  await birthday.fill('۱/۱/۱۳۷۰');
  await birthday.blur();
  await expect(birthday).toHaveValue('۱ فروردین ۱۳۷۰');
  await page.getByRole('button', { name: 'ذخیره مخاطب' }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expectCount(page, '۶');
  await expect(page.getByRole('button', { name: 'نگار صالحی' })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'نگار صالحی' }).click();
  await editChosen(page);
  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]{36}\/edit$/);
  await expect(
    page.getByRole('heading', { name: 'ویرایش مخاطب' }),
  ).toBeVisible();
  await expect(page.getByLabel('نام و نام خانوادگی')).toHaveValue('نگار صالحی');
  await expect(page.getByLabel('شماره تلفن')).toHaveValue('۰۹۱۲ ۱۱۱ ۲۲۲۲');
  await expect(birthday).toHaveValue('۱ فروردین ۱۳۷۰');
  await page.getByLabel(/یادآوری/).fill('کتاب رو پس بده');
  await page.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  // Desktop shows the saved contact beside the list.
  if (isDesk(page))
    await expect(
      page.locator('.desk-sheet').getByText('کتاب رو پس بده'),
    ).toBeVisible();

  // A direct load of the edit address opens the same form with saved values.
  await page.getByRole('button', { name: 'نگار صالحی' }).click();
  await editChosen(page);
  await expect(page).toHaveURL(/\/edit$/);
  await page.goto(page.url());
  await expect(page.getByLabel(/یادآوری/)).toHaveValue('کتاب رو پس بده');
  await expectCount(page, '۶');
});

test('cancel, close and back leave without saving', async ({ page }) => {
  await page.goto('/contacts');
  await addButton(page).click();
  await page.getByLabel('نام و نام خانوادگی').fill('ذخیره نشه');
  await page.getByRole('button', { name: 'انصراف' }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(page.locator('.contact-form')).toHaveCount(0);

  await addButton(page).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(page.locator('.contact-form')).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'مخاطب جدید' })).toBeVisible();

  await page.goto('/contacts/new');
  await page
    .getByRole('button', {
      name: isDesk(page) ? 'بستن' : 'بازگشت',
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expectCount(page, '۵');
  await expect(page.getByRole('button', { name: 'ذخیره نشه' })).toHaveCount(0);

  await page.goto('/contacts/00000000-0000-4000-8000-000000000000/edit');
  await expect(
    page.getByRole('heading', { name: 'این صفحه پیدا نشد' }),
  ).toBeVisible();
});

test('the details page shows one owned contact and its actions', async ({
  page,
  context,
  account,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/contacts');
  const href = await detailsHref(page, 'بهار رضایی');
  expect(href).toMatch(/\/contacts\/[0-9a-f-]{36}$/);
  // Desktop shows details beside the list; the address still opens the page.
  if (isDesk(page)) await page.goto(href);
  else await page.getByRole('link', { name: 'جزئیات بهار رضایی' }).click();

  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'بهار رضایی' })).toBeVisible();
  await expect(page.getByText('۰۹۱۲ ۳۴۵ ۶۷۸۹')).toBeVisible();
  await expect(page.getByText('۱۵ مهر ۱۳۷۵')).toBeVisible();
  await expect(page.getByText('پنجشنبه زنگ بزن')).toBeVisible();
  await expect(page.getByRole('link', { name: 'تماس' })).toHaveAttribute(
    'href',
    'tel:09123456789',
  );
  await expect(page.getByRole('link', { name: 'پیامک' })).toHaveAttribute(
    'href',
    'sms:09123456789',
  );

  // Share sends the contact's public link (/s/<code>): touch screens through
  // the share sheet with the name and number, computers by copying it.
  const publicLink = new RegExp(
    `^${new URL(page.url()).origin}/s/[0-9a-f]{32}$`,
  );
  const touch = await page.evaluate(
    () => matchMedia('(pointer: coarse)').matches,
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: { title?: string; text?: string }) => {
        (window as unknown as { __shared?: unknown }).__shared = data;
      },
    });
  });
  await page.getByRole('button', { name: 'اشتراک' }).click();
  type Shared = { title?: string; text?: string; url?: string };
  const sent = () =>
    page.evaluate(() => (window as { __shared?: Shared }).__shared);
  let shared: string;
  if (touch) {
    await expect
      .poll(async () => (await sent())?.url ?? '')
      .toMatch(publicLink);
    expect(await sent()).toMatchObject({
      title: 'بهار رضایی',
      text: 'بهار رضایی\n09123456789',
    });
    shared = (await sent())!.url!;
  } else {
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toMatch(publicLink);
    await expect(page.locator('.copy-toast')).toHaveText('لینک مخاطب کپی شد.');
    shared = await page.evaluate(() => navigator.clipboard.readText());
  }
  // Someone else, never signed in, opens the link: the card, no login, and
  // nothing private (no reminder, no birthday, no edit or delete).
  const stranger = await page.context().browser()!.newContext();
  const visitor = await stranger.newPage();
  await visitor.goto(shared);
  await expect(visitor).toHaveURL(publicLink);
  await expect(
    visitor.getByRole('heading', { name: 'بهار رضایی' }),
  ).toBeVisible();
  await expect(visitor.getByText('۰۹۱۲ ۳۴۵ ۶۷۸۹')).toBeVisible();
  await expect(visitor.getByRole('link', { name: 'تماس' })).toHaveAttribute(
    'href',
    'tel:09123456789',
  );
  await expect(visitor.getByText('پنجشنبه زنگ بزن')).toHaveCount(0);
  await expect(visitor.getByText('۱۵ مهر ۱۳۷۵')).toHaveCount(0);
  await expect(visitor.getByRole('link', { name: /ویرایش/ })).toHaveCount(0);
  await stranger.close();

  await page.getByRole('link', { name: 'ویرایش مخاطب' }).click();
  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]{36}\/edit$/);
  await expect(page.getByLabel('نام و نام خانوادگی')).toHaveValue('بهار رضایی');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'بهار رضایی' })).toBeVisible();

  const other = fixture<{ email: string; token: string }>({ action: 'create' });
  try {
    await context.clearCookies();
    await context.addCookies([
      {
        name: 'contacts_session',
        value: other.token,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await page.goto(href);
    await expect(
      page.getByRole('heading', { name: 'این صفحه پیدا نشد' }),
    ).toBeVisible();
  } finally {
    fixture({ action: 'delete', email: other.email });
  }
  await context.clearCookies();
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
  await page.goto('/contacts/00000000-0000-4000-8000-000000000000');
  await expect(
    page.getByRole('heading', { name: 'این صفحه پیدا نشد' }),
  ).toBeVisible();
  await page.goto('/contacts/not-a-contact');
  await expect(
    page.getByRole('heading', { name: 'این صفحه پیدا نشد' }),
  ).toBeVisible();

  // Delete on its page asks, then sends it to the trash; the list offers Undo.
  await page.goto(href);
  await page.getByRole('button', { name: 'حذف مخاطب' }).click();
  const dialog = page.getByRole('dialog', { name: 'حذف «بهار رضایی»؟' });
  await expect(dialog).toContainText('تا ۷ روز می‌تونی برش گردونی');
  await dialog.getByRole('button', { name: 'انصراف' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'بهار رضایی' })).toBeVisible();
  await page.getByRole('button', { name: 'حذف مخاطب' }).click();
  await dialog.getByRole('button', { name: 'حذف', exact: true }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(page.locator('.undo-toast')).toContainText(
    '«بهار رضایی» به سطل زباله رفت',
  );
  await expect(page.getByRole('button', { name: /بهار رضایی/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: /بهار رضایی/ })).toHaveCount(0);
});

test('a chosen photo is previewed and can be removed before saving', async ({
  page,
}) => {
  await page.goto('/contacts/new');
  const input = page.locator('.photo-field input[type="file"]');
  await input.setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not an image'),
  });
  await expect(
    page.getByText('فقط عکس JPEG، PNG یا WebP قابل استفاده‌ست.'),
  ).toBeVisible();
  await input.setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await expect(page.locator('.photo-current img')).toHaveAttribute(
    'src',
    /^blob:/,
  );
  await expect(page.getByRole('button', { name: 'تغییر عکس' })).toBeVisible();
  await page.getByRole('button', { name: 'حذف عکس' }).click();
  await expect(page.getByRole('button', { name: 'افزودن عکس' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'حذف عکس' })).toHaveCount(0);
});

test('the calendar button picks a birthday', async ({ page }) => {
  await page.goto('/contacts/new');
  await page.getByRole('button', { name: 'انتخاب از تقویم' }).click();
  const calendar = page.getByRole('dialog', { name: 'انتخاب از تقویم' });
  // Jalali months in Persian, and nothing after today can be chosen.
  await calendar
    .getByRole('combobox', { name: 'سال را انتخاب کنید' })
    .selectOption('1375');
  await calendar
    .getByRole('combobox', { name: 'ماه را انتخاب کنید' })
    .selectOption({ label: 'مهر' });
  await calendar.getByRole('button', { name: /۱۵-ام مهر ۱۳۷۵/ }).click();
  await expect(calendar).toBeHidden();
  await expect(page.getByLabel(/تاریخ تولد/)).toHaveValue('۱۵ مهر ۱۳۷۵');

  // Escape closes it without changing the date.
  await page.getByRole('button', { name: 'انتخاب از تقویم' }).click();
  await page.keyboard.press('Escape');
  await expect(calendar).toBeHidden();
  await expect(page.getByLabel(/تاریخ تولد/)).toHaveValue('۱۵ مهر ۱۳۷۵');
});

test('a number already in the book is named, and saving it asks first', async ({
  page,
}) => {
  await page.goto('/contacts');
  await addButton(page).click();
  const note = page.locator('.phone-match');
  const save = page.getByRole('button', { name: 'ذخیره مخاطب' });
  const confirm = page.getByRole('dialog', { name: 'این شماره تکراریه' });
  await page.getByLabel('نام و نام خانوادگی').fill('بهار جدید');
  // بهار رضایی is 09123456789; the international form is the same number.
  const phone = page.getByLabel('شماره تلفن');
  await phone.fill('+98 912 345 6789');
  await expect(note).toContainText(
    'این شماره قبلاً برای «بهار رضایی» ثبت شده.',
  );
  await phone.fill('09129990000');
  await expect(note).toHaveCount(0);

  // Saved straight away, before the note could appear: it still asks.
  await phone.fill('09123456789');
  await save.click();
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText(
    '«بهار رضایی» هم همین شماره رو داره. مطمئنی می‌خوای ذخیره‌اش کنی؟',
  );
  // The safe choice has focus, so Enter cannot save by accident.
  await expect(confirm.getByRole('button', { name: 'برگرد' })).toBeFocused();
  // "Go back" keeps the form as it was.
  await confirm.getByRole('button', { name: 'برگرد' }).click();
  await expect(confirm).toBeHidden();
  await expect(page).toHaveURL(/\/contacts\/new$/);
  await expect(phone).toHaveValue('09123456789');
  // The second time, "yes" saves.
  await save.click();
  await confirm.getByRole('button', { name: 'بله، ذخیره کن' }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(page.getByRole('button', { name: /بهار جدید/ })).toBeVisible();

  // Editing without changing the number never asks, even with a twin.
  await page
    .getByRole('button', { name: /سارا احمدی/ })
    .first()
    .click();
  await editChosen(page);
  await expect(note).toContainText('«سارا احمدی»');
  await page.getByLabel('نام و نام خانوادگی').fill('سارا احمدی‌نژاد');
  await page.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /سارا احمدی‌نژاد/ }),
  ).toBeVisible();
});
