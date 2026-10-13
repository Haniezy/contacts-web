import { test as base, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
export function fixture<T = unknown>(data: Record<string, unknown>): T {
  const result = execFileSync(
    process.execPath,
    ['--import', 'tsx', path.resolve('tests/e2e/fixture-cli.ts')],
    { input: JSON.stringify(data), encoding: 'utf8' },
  ).trim();
  return JSON.parse(result || 'null') as T;
}
export const test = base.extend<{
  account: { email: string; password: string; token: string };
}>({
  account: async ({}, provide) => {
    const account = fixture<{ email: string; password: string; token: string }>(
      { action: 'create' },
    );
    try {
      await provide(account);
    } finally {
      fixture({ action: 'delete', email: account.email });
    }
  },
});
export { expect };

// The menu opens from «منو» on mobile and tablet and from «حساب کاربری» on
// desktop.
export async function openMenu(page: Page) {
  await page
    .getByRole('button', { name: /^(منو|حساب کاربری)$/ })
    .filter({ visible: true })
    .click();
  return page.getByRole('dialog', { name: 'منو' });
}

// From 1024px wide the list sits beside a sidebar and shows the chosen
// contact in a panel; narrower screens open each row in place.
export const isDesk = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

export const rows = (page: Page) =>
  page.locator(isDesk(page) ? '.desk-row' : '.contact-row');

// The add button: in the header on phones, in the sidebar on desktop.
export const addButton = (page: Page) =>
  page.locator(isDesk(page) ? '.desk-add' : '.contacts-add');

// The book's size: «۵ نفر» on phones, «(۵)» after the desktop title.
export async function expectCount(page: Page, count: string) {
  if (isDesk(page))
    await expect(page.locator('.desk-count')).toHaveText(`(${count})`);
  else
    await expect(page.locator('.count-chip').first()).toHaveText(
      `${count} نفر`,
    );
}

// Edit or delete the contact whose row is open (phones) or whose details
// show (desktop).
export async function editChosen(page: Page) {
  if (isDesk(page))
    await page
      .locator('.desk-sheet')
      .getByRole('button', { name: 'ویرایش مخاطب', exact: true })
      .click();
  else
    await page
      .locator('.contact-row.is-open')
      .getByRole('link', { name: 'ویرایش' })
      .click();
}
export async function deleteChosen(page: Page) {
  if (isDesk(page)) {
    await page
      .locator('.desk-sheet')
      .getByRole('button', { name: 'بیشتر', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'حذف مخاطب' }).click();
  } else
    await page
      .locator('.contact-row.is-open')
      .getByRole('button', { name: 'حذف', exact: true })
      .click();
}

// The address of a contact's own page (the phone row's avatar links there).
export const detailsHref = async (page: Page, name: string) =>
  (await page.locator(`a[aria-label="جزئیات ${name}"]`).getAttribute('href'))!;
