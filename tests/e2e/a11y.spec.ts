import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, fixture, openMenu, test } from './fixtures';

// Small text kept in the design's own colours (decided in phase 11): these
// stay out of the contrast check only; every other rule still applies.
const designColours = [
  '.count-chip',
  '.optional-chip',
  '.locked-chip',
  '.status-chip',
  '.danger-card',
  '.app-version',
  '.menu-badge',
  '.menu-logout',
  '.merge-cancel',
  '.button-mint',
  '.language-switch [aria-pressed="true"]',
  '.theme-switch',
  '.error-toast',
];

async function audit(page: Page) {
  const rules = await new AxeBuilder({ page })
    .disableRules(['color-contrast'])
    .analyze();
  // Each exclude call takes one selector; an array means a path into frames.
  const contrast = designColours
    .reduce(
      (builder, selector) => builder.exclude(selector),
      new AxeBuilder({ page }).withRules(['color-contrast']),
    )
    .analyze();
  const problems = [...rules.violations, ...(await contrast).violations].map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(problems).toEqual([]);
  // Nothing may stick out sideways at any size.
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBe(0);
}

test('public pages and the not-found page pass the accessibility checks', async ({
  page,
}) => {
  for (const path of ['/', '/login', '/signup', '/nope']) {
    await page.goto(path);
    await audit(page);
  }
  await expect(
    page.getByRole('heading', { name: 'این صفحه پیدا نشد' }),
  ).toBeVisible();
});

test('signed-in pages, menus and dialogs pass the accessibility checks', async ({
  page,
  context,
  account,
}) => {
  fixture({
    action: 'contacts',
    email: account.email,
    contacts: [
      { name: 'بهار رضایی', phone: '09123456789', birthday: '1996-10-06' },
      { name: 'بهار.ر نوری', phone: '+989123456789', reminder: 'قهوه' },
      { name: 'آرش محمدی', phone: '09121112233' },
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
  for (const path of [
    '/contacts',
    '/contacts/new',
    '/contacts/duplicates',
    '/profile',
    '/settings',
    '/2fa/setup',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await audit(page);
  }

  await page.goto('/contacts');
  await page.getByRole('button', { name: 'بهار رضایی' }).click();
  await audit(page);
  const details = page.getByRole('link', { name: 'جزئیات بهار رضایی' });
  await page.goto((await details.getAttribute('href'))!);
  await expect(
    page.getByRole('heading', { level: 1, name: 'بهار رضایی' }),
  ).toBeVisible();
  await audit(page);
  await page.getByRole('button', { name: 'حذف مخاطب' }).click();
  await expect(
    page.getByRole('dialog', { name: 'حذف «بهار رضایی»؟' }),
  ).toBeVisible();
  await audit(page);
  await page.keyboard.press('Escape');
  await page.goto('/contacts');
  await expect(await openMenu(page)).toBeVisible();
  await audit(page);
  await page.keyboard.press('Escape');

  await page.goto('/contacts/duplicates');
  await page.getByRole('button', { name: 'بررسی و ادغام' }).click();
  await expect(page.getByRole('dialog', { name: 'ادغام مخاطب' })).toBeVisible();
  await audit(page);

  await page.goto('/settings');
  await page.getByRole('button', { name: 'حذف حساب', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'حساب کاربری حذف بشه؟' }),
  ).toBeVisible();
  await audit(page);
});

test('the empty book and the error toast pass the accessibility checks', async ({
  page,
  context,
  account,
}) => {
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
  await page.goto('/contacts');
  await expect(
    page.getByRole('heading', { name: 'هنوز مخاطبی نداری' }),
  ).toBeVisible();
  await audit(page);
  await page.route('**/api/contacts?**', (route) => route.abort());
  await page.getByRole('searchbox').fill('x');
  await expect(page.getByRole('alert')).toBeVisible();
  await audit(page);
});

test('the keyboard reaches every control with a visible focus ring', async ({
  page,
  context,
  account,
}) => {
  fixture({
    action: 'contacts',
    email: account.email,
    contacts: [{ name: 'آرش محمدی', phone: '09121112233' }],
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
  await page.goto('/contacts');
  const details = await page
    .getByRole('link', { name: 'جزئیات آرش محمدی' })
    .getAttribute('href');
  for (const path of ['/contacts', details!, '/profile', '/settings']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    // Skeletons show the real title too; wait until the page has loaded.
    await expect(
      page.getByRole('status').filter({ hasText: 'در حال بارگذاری' }),
    ).toHaveCount(0);
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          name: el.outerHTML.slice(0, 60),
          visible: box.width > 0 && box.height > 0,
          // Text fields show focus on their line or frame (:focus-within).
          ring:
            (style.outlineStyle !== 'none' && style.outlineWidth !== '0px') ||
            Boolean(el.closest('.field-line, .contacts-search')),
        };
      });
      if (!focused) continue;
      seen.add(focused.name);
      expect(focused, focused.name).toMatchObject({
        visible: true,
        ring: true,
      });
    }
    expect(seen.size).toBeGreaterThan(2);
  }
});
