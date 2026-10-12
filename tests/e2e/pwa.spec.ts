import type { Page } from '@playwright/test';
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

// Syncing sends exactly what waits, never loses a later change, and only
// says it all went through when it did. A "lost reply" is a request the
// server carried out whose answer never reached the app.
test.describe('exact sync', () => {
  // These fake lost replies and slow answers with page.route, which stops
  // seeing a page's requests once the service worker controls it (a
  // Playwright limit). Opening offline is covered above; here it is off.
  test.use({ serviceWorkers: 'block' });
  test.beforeEach(async ({ context, account }) => {
    fixture({
      action: 'contacts',
      email: account.email,
      contacts: [{ name: 'سارا احمدی', phone: '09121112233' }],
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

  // The next new contact reaches the server (or not), and the reply is lost.
  async function loseCreateReply(page: Page, reachServer = true) {
    let done = false;
    await page.route('**/api/contacts', async (route) => {
      if (done || route.request().method() !== 'POST') return route.fallback();
      done = true;
      if (reachServer) await route.fetch();
      await route.abort('connectionreset');
    });
  }
  async function addContact(page: Page, name: string, phone: string) {
    await page.locator('.contacts-add').click();
    await page.getByLabel('نام و نام خانوادگی').fill(name);
    await page.getByLabel('شماره تلفن').fill(phone);
    await page.getByRole('button', { name: 'ذخیره مخاطب' }).click();
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
  async function editContact(
    page: Page,
    name: string,
    label: RegExp,
    value: string,
  ) {
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await page
      .locator('.contact-row.is-open')
      .getByRole('link', { name: 'ویرایش' })
      .click();
    await page.getByLabel(label).fill(value);
    await page.getByRole('button', { name: 'ذخیره تغییرات' }).click();
    await expect(page).toHaveURL(/\/contacts$/);
  }
  async function deleteContact(page: Page, name: string) {
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await page
      .locator('.contact-row.is-open')
      .getByRole('button', { name: 'حذف', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'حذف', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: new RegExp(name) }),
    ).toHaveCount(0);
  }
  // What waits in the offline book: kind and name (or reminder) per change.
  const waiting = (page: Page) =>
    page.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          const open = indexedDB.open('dafarche-offline');
          open.onsuccess = () => {
            const get = open.result
              .transaction('books')
              .objectStore('books')
              .getAll();
            get.onsuccess = () => {
              open.result.close();
              type Change = { kind: string; values?: { name?: string } };
              resolve(
                ((get.result[0]?.changes ?? []) as Change[]).map(
                  (c) => `${c.kind}:${c.values?.name ?? ''}`,
                ),
              );
            };
          };
        }),
    );
  type Saved = { id: string; name: string; reminder: string | null };
  const onServer = async (page: Page, path = '/api/contacts') =>
    ((await (await page.request.get(path)).json()) as { contacts: Saved[] })
      .contacts;
  const copied = (page: Page) =>
    expect
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
      .toBeGreaterThan(0);
  const allSynced = 'همه‌ی تغییرات بدون اینترنتت توی حسابت ثبت شد';

  test('a lost reply, then an edit: the edit reaches the server', async ({
    page,
  }) => {
    await page.goto('/contacts');
    await loseCreateReply(page);
    await addContact(page, 'نسخه اول', '09121110001');
    await page.unrouteAll({ behavior: 'wait' });
    expect((await onServer(page)).map((c) => c.name)).toContain('نسخه اول');
    await editContact(page, 'نسخه اول', /نام و نام خانوادگی/, 'نسخه دوم');

    const notice = page.locator('.sync-toast');
    await notice.getByRole('button', { name: 'تأیید' }).click();
    await expect(notice).toContainText(allSynced);
    const names = (await onServer(page)).map((c) => c.name);
    expect(names.sort()).toEqual(['سارا احمدی', 'نسخه دوم'].sort());
    expect(await waiting(page)).toEqual([]);
  });

  test('a lost reply, then a delete: the contact goes to the trash', async ({
    page,
  }) => {
    await page.goto('/contacts');
    await loseCreateReply(page);
    await addContact(page, 'موقت', '09121110002');
    await page.unrouteAll({ behavior: 'wait' });
    await deleteContact(page, 'موقت');

    // The delete waits like any change and is offered for syncing.
    const notice = page.locator('.sync-toast');
    await expect(notice).toContainText('یک تغییری');
    await notice.getByRole('button', { name: 'تأیید' }).click();
    await expect(notice).toContainText(allSynced);
    expect((await onServer(page)).map((c) => c.name)).toEqual(['سارا احمدی']);
    expect(
      (await onServer(page, '/api/contacts/trash')).map((c) => c.name),
    ).toEqual(['موقت']);
    await page.reload();
    await expect(page.getByRole('button', { name: /موقت/ })).toHaveCount(0);
  });

  test('a second edit made while the first is syncing is kept', async ({
    page,
    context,
  }) => {
    await page.goto('/contacts');
    await copied(page);
    await context.setOffline(true);
    await editContact(page, 'سارا احمدی', /یادآوری/, 'یادداشت اول');
    await context.setOffline(false);
    // The first edit takes a while to reach the server.
    await page.route('**/api/contacts/*', async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.fallback();
    });
    const notice = page.locator('.sync-toast');
    await notice.getByRole('button', { name: 'تأیید' }).click();
    await editContact(page, 'سارا احمدی', /یادآوری/, 'یادداشت دوم');

    await expect(notice).toContainText(allSynced, { timeout: 30000 });
    const [saved] = await onServer(page);
    expect(saved.reminder).toBe('یادداشت دوم');
    expect(await waiting(page)).toEqual([]);
  });

  test('a lost reply and an edit survive a reload before syncing', async ({
    page,
  }) => {
    await page.goto('/contacts');
    await loseCreateReply(page);
    await addContact(page, 'نسخه اول', '09121110004');
    await page.unrouteAll({ behavior: 'wait' });
    await editContact(page, 'نسخه اول', /نام و نام خانوادگی/, 'نسخه دوم');
    await page.reload();
    await expect(page.getByRole('button', { name: 'نسخه دوم' })).toBeVisible();
    // The values sent stay as sent; the edit waits beside them.
    expect(await waiting(page)).toEqual(['create:نسخه اول']);

    const notice = page.locator('.sync-toast');
    await notice.getByRole('button', { name: 'تأیید' }).click();
    await expect(notice).toContainText(allSynced);
    const names = (await onServer(page)).map((c) => c.name);
    expect(names.sort()).toEqual(['سارا احمدی', 'نسخه دوم'].sort());
    expect(await waiting(page)).toEqual([]);
  });

  test('a create that never reached the server is made once, with the edit', async ({
    page,
  }) => {
    await page.goto('/contacts');
    await loseCreateReply(page, false);
    await addContact(page, 'نسخه اول', '09121110005');
    await page.unrouteAll({ behavior: 'wait' });
    expect((await onServer(page)).map((c) => c.name)).toEqual(['سارا احمدی']);
    await editContact(page, 'نسخه اول', /نام و نام خانوادگی/, 'نسخه دوم');

    const notice = page.locator('.sync-toast');
    await notice.getByRole('button', { name: 'تأیید' }).click();
    await expect(notice).toContainText(allSynced);
    const names = (await onServer(page)).map((c) => c.name);
    expect(names.sort()).toEqual(['سارا احمدی', 'نسخه دوم'].sort());
  });

  test('syncing a lost reply keeps a field changed on another device', async ({
    page,
  }) => {
    await page.goto('/contacts');
    await loseCreateReply(page);
    await addContact(page, 'نسخه اول', '09121110006');
    await page.unrouteAll({ behavior: 'wait' });
    const { id } = (await onServer(page)).find((c) => c.name === 'نسخه اول')!;
    // Another device adds a reminder meanwhile.
    const elsewhere = await page.request.patch(`/api/contacts/${id}`, {
      data: { reminder: 'از دستگاه دیگر' },
    });
    expect(elsewhere.ok()).toBe(true);
    await editContact(page, 'نسخه اول', /نام و نام خانوادگی/, 'نسخه دوم');

    const notice = page.locator('.sync-toast');
    await notice.getByRole('button', { name: 'تأیید' }).click();
    await expect(notice).toContainText(allSynced);
    const saved = (await onServer(page)).find((c) => c.id === id)!;
    expect(saved).toMatchObject({
      name: 'نسخه دوم',
      reminder: 'از دستگاه دیگر',
    });
  });

  test('a contact deleted elsewhere is reported as not saved, not as success', async ({
    page,
  }) => {
    await page.goto('/contacts');
    await loseCreateReply(page);
    await addContact(page, 'نسخه اول', '09121110007');
    await page.unrouteAll({ behavior: 'wait' });
    const { id } = (await onServer(page)).find((c) => c.name === 'نسخه اول')!;
    await editContact(page, 'نسخه اول', /نام و نام خانوادگی/, 'نسخه دوم');
    // Another device moves it to the trash meanwhile.
    expect((await page.request.delete(`/api/contacts/${id}`)).ok()).toBe(true);

    const notice = page.locator('.sync-toast');
    await notice.getByRole('button', { name: 'تأیید' }).click();
    await expect(notice).toContainText('بعضی تغییرات ثبت نشد');
    await expect(notice).toContainText('«نسخه دوم»');
    await expect(notice).not.toContainText(allSynced);
    await expect(notice).not.toContainText('بقیه ثبت شد');
    expect((await onServer(page)).map((c) => c.name)).toEqual(['سارا احمدی']);
    expect(
      (await onServer(page, '/api/contacts/trash')).map((c) => c.name),
    ).toEqual(['نسخه اول']);
    expect(await waiting(page)).toEqual([]);
  });

  test('a sync cut off midway says so, keeps everything, and finishes on retry', async ({
    page,
  }) => {
    await page.goto('/contacts');
    await loseCreateReply(page);
    await addContact(page, 'نسخه اول', '09121110008');
    await page.unrouteAll({ behavior: 'wait' });
    await editContact(page, 'نسخه اول', /نام و نام خانوادگی/, 'نسخه دوم');
    // The connection drops as the sync sends the new contact again.
    await page.route('**/api/contacts', (route) =>
      route.request().method() === 'POST'
        ? route.abort('connectionreset')
        : route.fallback(),
    );
    const notice = page.locator('.sync-toast');
    await notice.getByRole('button', { name: 'تأیید' }).click();
    await expect(notice).toContainText('همگام‌سازی کامل نشد');
    await expect(notice).not.toContainText(allSynced);
    expect(await waiting(page)).toEqual(['create:نسخه اول']);

    await page.unrouteAll({ behavior: 'wait' });
    await notice.getByRole('button', { name: 'دوباره' }).click();
    await expect(notice).toContainText(allSynced);
    const names = (await onServer(page)).map((c) => c.name);
    expect(names.sort()).toEqual(['سارا احمدی', 'نسخه دوم'].sort());
    expect(await waiting(page)).toEqual([]);
  });

  test('offline changes never sent: one request each, none for a contact made and deleted offline', async ({
    page,
    context,
  }) => {
    await page.goto('/contacts');
    await copied(page);
    await context.setOffline(true);
    await addContact(page, 'آفلاین', '09121110009');
    await editContact(page, 'آفلاین', /نام و نام خانوادگی/, 'آفلاین دوم');
    await addContact(page, 'موقت', '09121110010');
    await deleteContact(page, 'موقت');
    expect(await waiting(page)).toEqual(['create:آفلاین دوم', 'delete:']);
    await context.setOffline(false);

    const sent: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/contacts') && request.method() !== 'GET')
        sent.push(request.method());
    });
    const notice = page.locator('.sync-toast');
    await expect(notice).toContainText('یک تغییری');
    await notice.getByRole('button', { name: 'تأیید' }).click();
    await expect(notice).toContainText(allSynced);
    expect(sent).toEqual(['POST']);
    const names = (await onServer(page)).map((c) => c.name);
    expect(names.sort()).toEqual(['آفلاین دوم', 'سارا احمدی'].sort());
  });
});
