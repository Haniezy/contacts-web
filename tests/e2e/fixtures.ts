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
