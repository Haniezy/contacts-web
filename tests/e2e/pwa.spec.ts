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

  test('the menu opens install steps for this device', async ({
    page,
    browser,
    account,
  }, info) => {
    await page.goto('/contacts');
    const menu = await openMenu(page);
    await menu.getByRole('button', { name: /نصب اپ دفترچه/ }).click();
    const sheet = page.getByRole('dialog', { name: 'نصب دفترچه' });
    await expect(sheet).toBeVisible();
    // Pixel 7 is Android; the other projects are desktop browsers.
    await expect(sheet.locator('.install-steps')).toContainText(
      info.project.name === 'mobile' ? 'منوی ⋮' : 'نوار آدرس',
    );
    await sheet.getByRole('button', { name: 'بستن' }).click();
    await expect(sheet).toBeHidden();

    // Safari on an iPhone gets the Share → Add to Home Screen steps.
    const iphone = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 },
    });
    await iphone.addCookies([
      {
        name: 'contacts_session',
        value: account.token,
        domain: '127.0.0.1',
        path: '/',
      },
    ]);
    const phone = await iphone.newPage();
    await phone.goto('/contacts');
    await (
      await openMenu(phone)
    )
      .getByRole('button', { name: /نصب اپ دفترچه/ })
      .click();
    await expect(phone.locator('.install-steps')).toContainText(
      'Add to Home Screen',
    );
    await iphone.close();
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
  });
});
