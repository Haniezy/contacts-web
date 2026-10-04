import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 20000 },
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    // Portrait tablet: the phone layout in a centred column.
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  // The app with test settings: the test database, a test-only signing key
  // and 2FA key (also used by tests/e2e/fixture-cli.ts) and roomy rate limits.
  webServer: {
    command: 'npm run start -- --port 3100',
    url: 'http://127.0.0.1:3100/health',
    env: {
      DATABASE_URL: process.env.DATABASE_TEST_URL ?? '',
      JWT_SECRET: 'browser-tests-only-signing-secret-48-characters-long',
      TWO_FACTOR_ENCRYPTION_KEY: '2a'.repeat(32),
      APP_ORIGIN: 'http://127.0.0.1:3100',
      AUTH_COOKIE_SECURE: 'false',
      RATE_LIMIT_SCALE: '20',
    },
    reuseExistingServer: false,
  },
});
