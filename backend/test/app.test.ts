import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app, createApp } from '../src/app.js';

let server: Server;
let baseUrl: string;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('health endpoint returns the service contract without caching', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok', service: 'backend' });
});

test('unknown endpoints return 404 instead of a healthy response', async () => {
  const response = await fetch(`${baseUrl}/does-not-exist`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Not found' });
});

test('protected route returns 401 without a cookie, without needing database access', async () => {
  const response = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'UNAUTHENTICATED' });
});

for (const available of [true, false]) {
  test(`readiness returns ${available ? 200 : 503} based on the database`, async () => {
    const readinessApp = createApp(async () => {
      if (!available) throw new Error('private database connection details');
    });
    const readinessServer = readinessApp.listen(0, '127.0.0.1');
    await once(readinessServer, 'listening');
    try {
      const { port } = readinessServer.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      assert.equal(response.status, available ? 200 : 503);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(
        await response.json(),
        available
          ? { status: 'ok', service: 'backend', database: 'connected' }
          : { status: 'unavailable', service: 'backend' },
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        readinessServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
}
