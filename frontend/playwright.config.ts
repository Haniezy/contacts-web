import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 20000 },
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node ../backend/test/browser-server.mjs',
      url: 'http://127.0.0.1:4100/health',
      reuseExistingServer: false,
    },
    {
      command: 'npm run start -- --port 3100',
      url: 'http://127.0.0.1:3100/health',
      env: {
        BACKEND_INTERNAL_URL: 'http://127.0.0.1:4100',
        APP_ORIGIN: 'http://127.0.0.1:3100',
      },
      reuseExistingServer: false,
    },
  ],
});
