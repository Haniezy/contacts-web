import process from 'node:process';
import { TextEncoder } from 'node:util';
import '../dist/config/env.js';
import { createApp } from '../dist/app.js';
import { createDatabaseClient } from '../dist/database/client.js';

if (!process.env.DATABASE_TEST_URL)
  throw new Error(
    'DATABASE_TEST_URL is required for browser integration tests',
  );
const database = createDatabaseClient(process.env.DATABASE_TEST_URL);
const config = {
  secret: new TextEncoder().encode(
    'browser-tests-only-signing-secret-48-characters-long',
  ),
  origin: 'http://127.0.0.1:3100',
  secureCookie: false,
  twoFactorKey: new Uint8Array(32).fill(42),
};
const server = createApp(async () => {}, {
  database: () => database,
  config: () => config,
  loginLimit: 100,
  twoFactorLimit: 200,
}).listen(4100, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(async () => {
      await database.$disconnect();
      process.exit(0);
    }),
  );
