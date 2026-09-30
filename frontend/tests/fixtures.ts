import { test as base, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
export function fixture<T = unknown>(data: Record<string, unknown>): T {
  const result = execFileSync(
    process.execPath,
    [path.resolve('../backend/test/browser-fixture.mjs')],
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
