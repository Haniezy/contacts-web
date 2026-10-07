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
  });
});
