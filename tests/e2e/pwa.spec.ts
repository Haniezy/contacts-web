import { expect, fixture, openMenu, test } from './fixtures';

test('the app can be installed: manifest, icons and an uncached service worker', async ({
  request,
}) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: 'دفترچه تلفن',
    short_name: 'دفترچه',
    start_url: '/contacts',
    display: 'standalone',
    dir: 'rtl',
  });
  expect(
    manifest.icons.map((icon: { purpose?: string }) => icon.purpose),
  ).toContain('maskable');
  for (const icon of [
    ...manifest.icons,
    { src: '/icons/apple-touch-icon.png' },
  ]) {
    const file = await request.get(icon.src);
    expect(file.ok()).toBe(true);
    expect(file.headers()['content-type']).toBe('image/png');
  }
  const worker = await request.get('/sw.js');
  expect(worker.ok()).toBe(true);
  expect(worker.headers()['cache-control']).toContain('no-store');
  expect((await request.get('/offline.html')).ok()).toBe(true);
});

test.describe('signed in', () => {
  test.beforeEach(async ({ context, account }) => {
    fixture({
      action: 'contacts',
      email: account.email,
      contacts: [{ name: 'بهار رضایی', phone: '09123456789' }],
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

  test('the menu offers installing only where the browser can', async ({
    page,
  }) => {
    await page.goto('/contacts');
    let menu = await openMenu(page);
    await expect(
      menu.getByRole('button', { name: /نصب اپ دفترچه/ }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');

    // The browser offers it (as Chrome does): the menu item opens the sheet,
    // whose button shows the browser's own install window.
    await page.evaluate(() => {
      const offer = Object.assign(new Event('beforeinstallprompt'), {
        prompt: async () => {
          (window as unknown as { prompted: boolean }).prompted = true;
        },
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      dispatchEvent(offer);
    });
    menu = await openMenu(page);
    await menu.getByRole('button', { name: /نصب اپ دفترچه/ }).click();
    const sheet = page.getByRole('dialog', { name: 'نصب دفترچه' });
    await expect(sheet).toBeVisible();
    await expect(sheet).not.toContainText('دستی');
    await sheet.getByRole('button', { name: 'نصب', exact: true }).click();
    await expect(sheet.getByRole('status')).toContainText('نصب شد');
    expect(
      await page.evaluate(
        () => (window as unknown as { prompted?: boolean }).prompted,
      ),
    ).toBe(true);
    await sheet.getByRole('button', { name: 'بستن' }).click();
    await expect(sheet).toBeHidden();
  });

  test('the list opens offline, and signing out deletes what was saved', async ({
    page,
    context,
  }) => {
    await page.goto('/contacts');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // The first visit installed the worker; this one is saved through it.
    await page.reload();
    await expect(
      page.getByRole('button', { name: /بهار رضایی/ }),
    ).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole('button', { name: /بهار رضایی/ }),
    ).toBeVisible();
    await expect(page.locator('.offline-note')).toContainText(
      'اتصال اینترنت نداری',
    );
    // A page never opened before shows the offline page instead.
    await page.goto('/contacts/duplicates');
    await expect(
      page.getByRole('heading', { name: 'اتصال اینترنت نداری' }),
    ).toBeVisible();

    await context.setOffline(false);
    await page.goto('/contacts');
    await (
      await openMenu(page)
    )
      .getByRole('button', { name: 'خروج', exact: true })
      .click();
    await expect(page).toHaveURL(/\/login$/);
    const saved = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const key of await caches.keys())
        for (const request of await (await caches.open(key)).keys())
          urls.push(new URL(request.url).pathname);
      return urls;
    });
    expect(
      saved.filter(
        (url) => url.startsWith('/contacts') || url.startsWith('/api'),
      ),
    ).toEqual([]);
    // The offline book goes too.
    expect(
      await page.evaluate(async () =>
        (await indexedDB.databases()).map((db) => db.name),
      ),
    ).not.toContain('dafarche-offline');
  });

  test('offline: add, edit and delete, then sync them once confirmed', async ({
    page,
    context,
    account,
  }) => {
    fixture({
      action: 'contacts',
      email: account.email,
      contacts: [{ name: 'آرش محمدی', phone: '09351234567' }],
    });
    await page.goto('/contacts');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    // The whole book is copied to this device shortly after the page opens.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const open = indexedDB.open('dafarche-offline');
              open.onsuccess = () => {
                const get = open.result
                  .transaction('books')
                  .objectStore('books')
                  .getAll();
                get.onsuccess = () => {
                  open.result.close();
                  resolve(get.result[0]?.contacts?.length ?? 0);
                };
              };
              open.onerror = () => resolve(0);
            }),
        ),
      )
      .toBe(2);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.offline-note')).toBeVisible();
    await expect(page.locator('.count-chip').first()).toHaveText('۲ نفر');

    // Add.
    await page.locator('.contacts-add').click();
    await page.getByLabel('نام و نام خانوادگی').fill('نگار صالحی');
    await page.getByLabel('شماره تلفن').fill('09121112222');
    await page.getByRole('button', { name: 'ذخیره مخاطب' }).click();
    await expect(page).toHaveURL(/\/contacts$/);
    await expect(
      page.getByRole('button', { name: 'نگار صالحی' }),
    ).toBeVisible();
    await expect(page.locator('.count-chip').first()).toHaveText('۳ نفر');

    // Edit.
    await page.getByRole('button', { name: /بهار رضایی/ }).click();
    await page
      .locator('.contact-row.is-open')
      .getByRole('link', { name: 'ویرایش' })
      .click();
    await page.getByLabel('نام و نام خانوادگی').fill('بهار رضوی');
    await page.getByRole('button', { name: 'ذخیره تغییرات' }).click();
    await expect(page.getByRole('button', { name: 'بهار رضوی' })).toBeVisible();

    // Delete.
    await page.getByRole('button', { name: /آرش محمدی/ }).click();
    await page
      .locator('.contact-row.is-open')
      .getByRole('button', { name: 'حذف' })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'حذف', exact: true })
      .click();
    await expect(page.getByRole('button', { name: /آرش محمدی/ })).toHaveCount(
      0,
    );

    // Still there after reopening offline, and searchable.
    await page.reload();
    await expect(page.locator('.count-chip').first()).toHaveText('۲ نفر');
    await page
      .getByRole('searchbox', { name: 'جستجوی نام یا شماره' })
      .fill('۱۱۱');
    await expect(
      page.getByRole('button', { name: 'نگار صالحی' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'بهار رضوی' })).toHaveCount(
      0,
    );
    await page.getByRole('searchbox', { name: 'جستجوی نام یا شماره' }).fill('');

    // Nothing reached the server yet.
    const names = async () =>
      (
        (await (await page.request.get('/api/contacts')).json()) as {
          contacts: { name: string }[];
        }
      ).contacts
        .map((c) => c.name)
        .sort();
    await context.setOffline(false);
    expect(await names()).toEqual(['آرش محمدی', 'بهار رضایی'].sort());

    // Back online: the sync notice, then the changes once confirmed.
    const notice = page.locator('.sync-toast');
    await expect(notice).toContainText('همگام‌سازی تغییرات');
    await expect(notice).toContainText('۳ تغییری');
    await notice.getByRole('button', { name: 'تأیید' }).click();
    await expect(notice).toContainText('تغییرات همگام شد');
    expect(await names()).toEqual(['بهار رضوی', 'نگار صالحی'].sort());
    await expect(notice).toBeHidden({ timeout: 10000 });

    // The list is the server's again; the delete went to the trash.
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'نگار صالحی' }),
    ).toBeVisible();
    await expect(page.locator('.sync-toast')).toHaveCount(0);
    const trash = (await (
      await page.request.get('/api/contacts/trash')
    ).json()) as { contacts: { name: string }[] };
    expect(trash.contacts.map((c) => c.name)).toEqual(['آرش محمدی']);
  });
});

// As a person uses it: sign in through the form (the contacts page then
// opens without a full page load) and never reload. The connection drops
// with the app open, and later the app is opened with no connection.
test('after a plain sign-in the app works offline and syncs when confirmed', async ({
  page,
  context,
  account,
}) => {
  fixture({
    action: 'contacts',
    email: account.email,
    contacts: [{ name: 'بهار رضایی', phone: '09123456789' }],
  });
  await page.goto('/login');
  await page.getByLabel('ایمیل', { exact: true }).fill(account.email);
  await page.getByLabel('رمز عبور', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(page.getByRole('button', { name: /بهار رضایی/ })).toBeVisible();
  // Give the app a moment to keep what it needs offline.
  await page.waitForTimeout(4000);

  // The server answers but cannot reach its database (the app run locally
  // with the internet off): the saved copy, not the error page.
  await context.route(/\/contacts$/, (route) =>
    route.fulfill({ status: 500, body: 'down' }),
  );
  const failing = await context.newPage();
  await failing.goto('/contacts');
  await expect(
    failing.getByRole('button', { name: /بهار رضایی/ }),
  ).toBeVisible();
  await failing.close();
  await context.unroute(/\/contacts$/);

  // The connection drops while the app is open: saving still works.
  await context.setOffline(true);
  await expect(page.locator('.offline-note')).toBeVisible();
  await page.locator('.contacts-add').click();
  await page.getByLabel('نام و نام خانوادگی').fill('سارا احمدی');
  await page.getByLabel('شماره تلفن').fill('09351234567');
  await page.getByRole('button', { name: 'ذخیره مخاطب' }).click();
  await expect(page.getByRole('button', { name: 'سارا احمدی' })).toBeVisible();
  await expect(page.getByText('ذخیره انجام نشد')).toHaveCount(0);
  await page.close();

  // Opening the app with no connection.
  const app = await context.newPage();
  await app.goto('/contacts');
  await expect(app.getByRole('button', { name: /بهار رضایی/ })).toBeVisible();
  await expect(app.getByRole('button', { name: 'سارا احمدی' })).toBeVisible();
  await expect(app.locator('.offline-note')).toBeVisible();
  await app.locator('.contacts-add').click();
  await app.getByLabel('نام و نام خانوادگی').fill('نگار صالحی');
  await app.getByLabel('شماره تلفن').fill('09121112222');
  // The date picker loads its code on first use; offline too.
  await app.getByRole('button', { name: 'انتخاب از تقویم' }).click();
  await expect(app.locator('.birthday-calendar')).toBeVisible();
  await app.getByRole('button', { name: 'انتخاب از تقویم' }).click();
  await app.getByRole('button', { name: 'ذخیره مخاطب' }).click();
  await expect(app).toHaveURL(/\/contacts$/);
  await expect(app.getByRole('button', { name: 'نگار صالحی' })).toBeVisible();
  await expect(app.getByText('ذخیره انجام نشد')).toHaveCount(0);

  // Back online: confirm, and both are in the account.
  await context.setOffline(false);
  const notice = app.locator('.sync-toast');
  await expect(notice).toContainText('۲ تغییری');
  await notice.getByRole('button', { name: 'تأیید' }).click();
  await expect(notice).toContainText('تغییرات همگام شد');
  const { contacts } = (await (
    await app.request.get('/api/contacts')
  ).json()) as { contacts: { name: string }[] };
  expect(contacts.map((c) => c.name).sort()).toEqual(
    ['بهار رضایی', 'سارا احمدی', 'نگار صالحی'].sort(),
  );
});

// The browser still counts as online (a VPN or Docker network is up) and a
// server on this computer answers, but it cannot reach its database: every
// call fails with "service unavailable". The app works from the device,
// even reloaded on the new-contact form, an address never saved itself.
test('a server without its database counts as offline, and syncs once it is back', async ({
  page,
  account,
}) => {
  fixture({
    action: 'contacts',
    email: account.email,
    contacts: [{ name: 'بهار رضایی', phone: '09123456789' }],
  });
  await page.goto('/login');
  await page.getByLabel('ایمیل', { exact: true }).fill(account.email);
  await page.getByLabel('رمز عبور', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  await expect(page.getByRole('button', { name: /بهار رضایی/ })).toBeVisible();
  await page.waitForTimeout(4000);
  await page.locator('.contacts-add').click();
  await expect(page).toHaveURL(/\/contacts\/new$/);

  const down = /\/(api\/.*|ready|contacts(\/.*)?)(\?.*)?$/;
  await page.context().route(down, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"SERVICE_UNAVAILABLE"}',
    }),
  );
  await page.reload();
  await expect(page.getByRole('button', { name: /بهار رضایی/ })).toBeVisible();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(page.locator('.offline-note')).toBeVisible();
  await page.locator('.contacts-add').click();
  await page.getByLabel('نام و نام خانوادگی').fill('حنانه احمدی');
  await page.getByLabel('شماره تلفن').fill('09114588565');
  await page.getByRole('button', { name: 'ذخیره مخاطب' }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(page.getByRole('button', { name: 'حنانه احمدی' })).toBeVisible();
  await expect(page.getByLabel('نام و نام خانوادگی')).toHaveCount(0);
  await expect(page.getByText('ذخیره انجام نشد')).toHaveCount(0);

  // The database is back: the next check finds it and offers the sync.
  await page.context().unroute(down);
  const notice = page.locator('.sync-toast');
  await expect(notice).toContainText('یک تغییری');
  await notice.getByRole('button', { name: 'تأیید' }).click();
  await expect(notice).toContainText('تغییرات همگام شد');
  const { contacts } = (await (
    await page.request.get('/api/contacts')
  ).json()) as { contacts: { name: string }[] };
  expect(contacts.map((c) => c.name).sort()).toEqual(
    ['بهار رضایی', 'حنانه احمدی'].sort(),
  );
});
