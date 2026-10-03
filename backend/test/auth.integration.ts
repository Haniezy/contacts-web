import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/database/client.js';
import { createToken, cookieName } from '../src/auth/tokens.js';
import { verifyPassword } from '../src/auth/password.js';

const connectionString = process.env.DATABASE_TEST_URL;
if (!connectionString)
  throw new Error(
    'Set DATABASE_TEST_URL to a migrated development/test database',
  );

test('auth HTTP lifecycle against PostgreSQL', async (t) => {
  const database = createDatabaseClient(connectionString);
  const config = {
    secret: randomBytes(48),
    origin: 'http://localhost:3000',
    secureCookie: true,
  };
  const app = createApp(async () => {}, {
    database: () => database,
    config: () => config,
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`;
  const email = `auth-test-${randomUUID()}@contacts.example`;
  const password = 'Test-only 1234!';
  let cookie = '';
  let userId = '';
  const post = (
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(`${base}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  const getMe = (value = cookie) =>
    fetch(`${base}/me`, { headers: { Cookie: value } });
  try {
    await t.test(
      'signup validates input and returns only public fields with a secure HTTP-only cookie',
      async () => {
        for (const body of [
          { email, password: 'short' },
          // A misspelt popular domain is refused.
          { email: 'auth-test@gmial.com', password },
          // Name lengths share the profile's rules (see the account tests).
          { email, password, firstName: 'x' },
        ])
          assert.equal((await post('signup', body)).status, 400);
        const response = await post('signup', {
          email: ` ${email.toUpperCase()} `,
          password,
        });
        assert.equal(response.status, 201);
        const body = await response.json();
        userId = body.user.id;
        assert.deepEqual(body, { user: { id: userId, email } });
        const setCookie = response.headers.get('set-cookie')!;
        assert.match(setCookie, /HttpOnly/i);
        assert.match(setCookie, /Secure/i);
        assert.match(setCookie, /SameSite=Lax/i);
        assert.match(setCookie, /Path=\/api/i);
        cookie = setCookie.split(';')[0];
        const saved = await database.user.findUniqueOrThrow({
          where: { id: userId },
        });
        assert.match(saved.passwordHash, /^\$argon2id\$/);
        assert.equal(await verifyPassword(password, saved.passwordHash), true);
        assert.equal(
          (await post('signup', { email: email.toUpperCase(), password }))
            .status,
          409,
        );
      },
    );

    await t.test(
      'protected route accepts the session and rejects missing, forged, and expired JWTs',
      async () => {
        assert.equal((await getMe('')).status, 401);
        assert.equal(
          (await getMe(`${cookieName}=invalid.jwt.token`)).status,
          401,
        );
        const session = await database.authSession.findFirstOrThrow({
          where: { userId },
        });
        const expired = await createToken(
          userId,
          session.id,
          config,
          new Date(Date.now() - 10000),
        );
        assert.equal((await getMe(`${cookieName}=${expired}`)).status, 401);
        const response = await getMe();
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          user: {
            id: userId,
            email,
            firstName: '',
            lastName: '',
            photoUrl: null,
          },
        });
      },
    );

    await t.test(
      'login rejects incorrect credentials with the same response for unknown accounts',
      async () => {
        const wrong = await post('login', {
          email,
          password: 'wrong-password',
        });
        const unknown = await post('login', {
          email: `missing-${email}`,
          password,
        });
        assert.equal(wrong.status, 401);
        assert.equal(unknown.status, 401);
        assert.deepEqual(await wrong.json(), await unknown.json());
        assert.equal(wrong.headers.get('set-cookie'), null);
      },
    );

    await t.test(
      'logout removes the session so even a saved JWT cannot be replayed',
      async () => {
        const response = await post('logout', {}, { Cookie: cookie });
        assert.equal(response.status, 204);
        assert.match(
          response.headers.get('set-cookie')!,
          /Expires=Thu, 01 Jan 1970/,
        );
        assert.equal((await getMe()).status, 401);
        assert.equal(
          await database.authSession.count({ where: { userId } }),
          0,
        );
        const login = await post(
          'login',
          { email: email.toUpperCase(), password },
          { Origin: config.origin },
        );
        assert.equal(login.status, 200);
        assert.equal(
          login.headers.get('access-control-allow-origin'),
          config.origin,
        );
        assert.equal(
          login.headers.get('access-control-allow-credentials'),
          'true',
        );
        cookie = login.headers
          .getSetCookie()
          .find((value) => value.startsWith('contacts_session='))!
          .split(';')[0];
        assert.equal((await getMe()).status, 200);
      },
    );

    await t.test(
      'cookie-auth mutations reject cross-origin requests, forms, bad JSON and oversized bodies',
      async () => {
        assert.equal(
          (
            await post(
              'logout',
              {},
              { Cookie: cookie, Origin: 'https://evil.example' },
            )
          ).status,
          403,
        );
        assert.equal(
          (await post('logout', {}, { Cookie: cookie, Origin: 'null' })).status,
          403,
        );
        assert.equal(
          (
            await fetch(`${base}/logout`, {
              method: 'POST',
              headers: { Cookie: cookie, 'Content-Type': 'text/plain' },
              body: '{}',
            })
          ).status,
          415,
        );
        assert.equal(
          (
            await fetch(`${base}/login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{bad json',
            })
          ).status,
          400,
        );
        assert.equal(
          (await post('login', { email, password: 'x'.repeat(9000) })).status,
          413,
        );
        assert.equal((await getMe()).status, 200);
      },
    );

    await t.test(
      '2FA-enabled users cannot bypass verification using passwords or old sessions',
      async () => {
        await database.user.update({
          where: { id: userId },
          data: { twoFactorEnabled: true },
        });
        const login = await post('login', { email, password });
        assert.equal(login.status, 202);
        assert.deepEqual(await login.json(), { twoFactorRequired: true });
        assert.ok(
          login.headers
            .getSetCookie()
            .some((value) => value.startsWith('contacts_2fa_challenge=')),
        );
        assert.ok(
          login.headers
            .getSetCookie()
            .filter((value) => value.startsWith('contacts_session='))
            .every((value) => value.startsWith('contacts_session=;')),
        );
        assert.equal((await getMe()).status, 401);
        await database.user.update({
          where: { id: userId },
          data: { twoFactorEnabled: false },
        });
      },
    );

    await t.test(
      'expired database sessions are rejected even with an unexpired JWT',
      async () => {
        await database.authSession.updateMany({
          where: { userId },
          data: { expiresAt: new Date(0) },
        });
        assert.equal((await getMe()).status, 401);
      },
    );

    await t.test(
      'login rate limiting returns 429 and Retry-After',
      async () => {
        const limited = createApp(async () => {}, {
          database: () => database,
          config: () => config,
          loginLimit: 2,
        }).listen(0, '127.0.0.1');
        await once(limited, 'listening');
        try {
          const url = `http://127.0.0.1:${(limited.address() as AddressInfo).port}/api/auth/login`;
          for (let i = 0; i < 2; i++)
            assert.equal(
              (
                await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: '{}',
                })
              ).status,
              400,
            );
          const blocked = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          });
          assert.equal(blocked.status, 429);
          assert.ok(blocked.headers.get('retry-after'));
        } finally {
          await new Promise<void>((resolve, reject) =>
            limited.close((e) => (e ? reject(e) : resolve())),
          );
        }
      },
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    try {
      await database.user.deleteMany({ where: { email } });
    } finally {
      await database.$disconnect();
    }
  }
});
