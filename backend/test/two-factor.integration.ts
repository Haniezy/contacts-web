import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { generate } from 'otplib';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/database/client.js';
import { challengeHash, decryptSecret } from '../src/auth/two-factor-crypto.js';

const connectionString = process.env.DATABASE_TEST_URL;
if (!connectionString)
  throw new Error(
    'Set DATABASE_TEST_URL to a migrated development/test database',
  );

test('two-factor enrollment, login and atomic recovery against PostgreSQL', async (t) => {
  const db = createDatabaseClient(connectionString);
  const config = {
    secret: randomBytes(48),
    twoFactorKey: randomBytes(32),
    origin: 'http://localhost:3000',
    secureCookie: true,
  };
  let clock = Date.now();
  const server = createApp(async () => {}, {
    database: () => db,
    config: () => config,
    loginLimit: 100,
    twoFactorLimit: 100,
    now: () => new Date(clock),
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`;
  const email = `two-factor-test-${randomUUID()}@contacts.example`;
  const password = randomBytes(24).toString('base64url');
  let userId = '',
    session = '',
    secret = '';
  let codes: string[] = [];
  const post = (path: string, body: unknown, cookie = '') =>
    fetch(`${base}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    });
  const cookieFrom = (response: Response, name: string) =>
    response.headers
      .getSetCookie()
      .find((value) => value.startsWith(`${name}=`))!
      .split(';')[0];
  const me = (cookie: string) =>
    fetch(`${base}/me`, { headers: { Cookie: cookie } });
  const totp = () =>
    generate({
      secret,
      epoch: Math.floor(clock / 1000),
      digits: 6,
      period: 30,
    });
  const wrongCode = async () => {
    const valid = await Promise.all(
      [-30, 0, 30].map((offset) =>
        generate({ secret, epoch: Math.floor(clock / 1000) + offset }),
      ),
    );
    return ['000000', '111111', '222222', '333333'].find(
      (code) => !valid.includes(code),
    )!;
  };
  const challenge = async () => {
    const response = await post('login', { email, password });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { twoFactorRequired: true });
    assert.ok(
      response.headers
        .getSetCookie()
        .filter((value) => value.startsWith('contacts_session='))
        .every((value) => value.startsWith('contacts_session=;')),
    );
    return cookieFrom(response, 'contacts_2fa_challenge');
  };
  try {
    const signup = await post('signup', { email, password });
    assert.equal(signup.status, 201);
    userId = (await signup.json()).user.id;
    session = cookieFrom(signup, 'contacts_session');
    await t.test(
      'setup requires authentication and password; QR contains a pending encrypted secret',
      async () => {
        assert.equal((await post('2fa/setup', { password })).status, 401);
        assert.equal(
          (await post('2fa/setup', { password: 'incorrect' }, session)).status,
          401,
        );
        const response = await post('2fa/setup', { password }, session);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const data = await response.json();
        secret = data.secret;
        assert.equal(
          new URL(data.otpauthUri).searchParams.get('secret'),
          secret,
        );
        assert.match(data.qrCodeDataUrl, /^data:image\/png;base64,/);
        assert.equal(
          Buffer.from(data.qrCodeDataUrl.split(',')[1], 'base64')
            .subarray(1, 4)
            .toString(),
          'PNG',
        );
        const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
        assert.equal(user.twoFactorEnabled, false);
        assert.notEqual(user.twoFactorSecretEncrypted, secret);
        assert.equal(
          decryptSecret(user.twoFactorSecretEncrypted!, userId, config),
          secret,
        );
        assert.equal(
          (await post('2fa/verify', { code: await totp() })).status,
          401,
        );
      },
    );

    await t.test(
      'pending enrollment is session-bound, expires, and locks after five invalid codes',
      async () => {
        const secondLogin = await post('login', { email, password });
        const secondCookie = cookieFrom(secondLogin, 'contacts_session');
        assert.equal(
          (await post('2fa/confirm', { code: await totp() }, secondCookie))
            .status,
          400,
        );
        await db.user.update({
          where: { id: userId },
          data: { twoFactorSetupExpiresAt: new Date(0) },
        });
        assert.equal(
          (await post('2fa/confirm', { code: await totp() }, session)).status,
          400,
        );
        let setup = await post('2fa/setup', { password }, session);
        secret = (await setup.json()).secret;
        for (let i = 0; i < 5; i++)
          assert.equal(
            (await post('2fa/confirm', { code: await wrongCode() }, session))
              .status,
            401,
          );
        assert.equal(
          (await post('2fa/confirm', { code: await totp() }, session)).status,
          429,
        );
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: userId } }))
            .twoFactorEnabled,
          false,
        );
        setup = await post('2fa/setup', { password }, session);
        secret = (await setup.json()).secret;
      },
    );

    await t.test(
      'only a valid six-digit code enables 2FA, returns hashed recovery codes once, and revokes old sessions',
      async () => {
        assert.equal(
          (await post('2fa/confirm', { code: 123456 }, session)).status,
          400,
        );
        assert.equal(
          (await post('2fa/confirm', { code: '12345' }, session)).status,
          400,
        );
        const oldSession = session;
        const response = await post(
          '2fa/confirm',
          { code: await totp() },
          session,
        );
        assert.equal(response.status, 200);
        const data = await response.json();
        assert.equal(data.enabled, true);
        codes = data.recoveryCodes;
        assert.equal(codes.length, 10);
        session = cookieFrom(response, 'contacts_session');
        assert.equal((await me(oldSession)).status, 401);
        assert.equal((await me(session)).status, 200);
        const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
        assert.equal(user.twoFactorEnabled, true);
        assert.equal(user.recoveryCodeHashes.length, 10);
        assert.ok(
          user.recoveryCodeHashes.every((hash) => !codes.includes(hash)),
        );
        assert.equal(user.twoFactorSetupExpiresAt, null);
        assert.equal(
          (await post('2fa/setup', { password }, session)).status,
          409,
        );
        assert.equal(
          (await post('2fa/confirm', { code: await totp() }, session)).status,
          409,
        );
      },
    );

    await t.test(
      'password and challenge never authorize access; reused and incorrect TOTP codes fail',
      async () => {
        assert.equal((await post('logout', {}, session)).status, 204);
        const pending = await challenge();
        assert.equal((await me(pending)).status, 401);
        assert.equal(
          (
            await me(
              pending.replace('contacts_2fa_challenge=', 'contacts_session='),
            )
          ).status,
          401,
        );
        assert.equal(
          (await post('2fa/verify', { code: await totp() }, pending)).status,
          401,
        );
        assert.equal(
          (await post('2fa/verify', { code: await wrongCode() }, pending))
            .status,
          401,
        );
        assert.equal(await db.authSession.count({ where: { userId } }), 0);
        clock += 30000;
        const response = await post(
          '2fa/verify',
          { code: await totp() },
          pending,
        );
        assert.equal(response.status, 200);
        session = cookieFrom(response, 'contacts_session');
        assert.equal((await me(session)).status, 200);
        assert.equal(
          (await post('2fa/verify', { code: await totp() }, pending)).status,
          401,
        );
        const another = await challenge();
        assert.equal(
          (await post('2fa/verify', { code: await totp() }, another)).status,
          401,
        );
      },
    );

    await t.test(
      'challenge expiry and durable attempt caps cannot be bypassed with correct codes',
      async () => {
        const expired = await challenge();
        await db.loginChallenge.update({
          where: { tokenHash: challengeHash(expired.split('=')[1]) },
          data: { expiresAt: new Date(0) },
        });
        assert.equal(
          (await post('2fa/verify', { recoveryCode: codes[0] }, expired))
            .status,
          401,
        );
        const limited = await challenge();
        for (let i = 0; i < 5; i++)
          assert.equal(
            (await post('2fa/verify', { code: await wrongCode() }, limited))
              .status,
            401,
          );
        assert.equal(
          (await post('2fa/verify', { recoveryCode: codes[0] }, limited))
            .status,
          429,
        );
      },
    );

    await t.test(
      'concurrent valid TOTP requests consume the step and challenge only once',
      async () => {
        clock += 30000;
        const pending = await challenge();
        const body = { code: await totp() };
        const replies = await Promise.all([
          post('2fa/verify', body, pending),
          post('2fa/verify', body, pending),
        ]);
        assert.deepEqual(
          replies.map((response) => response.status).sort(),
          [200, 401],
        );
      },
    );

    await t.test(
      'recovery code works once, even across two concurrent login challenges',
      async () => {
        const first = await challenge();
        const second = await challenge();
        const replies = await Promise.all([
          post('2fa/verify', { recoveryCode: codes[0] }, first),
          post('2fa/verify', { recoveryCode: codes[0] }, second),
        ]);
        assert.deepEqual(
          replies.map((response) => response.status).sort(),
          [200, 401],
        );
        const successful = replies.find((response) => response.status === 200)!;
        session = cookieFrom(successful, 'contacts_session');
        assert.equal((await me(session)).status, 200);
        const status = await fetch(`${base}/2fa/status`, {
          headers: { Cookie: session },
        });
        assert.deepEqual(await status.json(), {
          enabled: true,
          recoveryCodesRemaining: 9,
        });
        const pending = await challenge();
        assert.equal(
          (await post('2fa/verify', { recoveryCode: codes[0] }, pending))
            .status,
          401,
        );
        assert.equal(
          (await post('2fa/verify', { recoveryCode: '0'.repeat(32) }, pending))
            .status,
          401,
        );
        assert.equal(
          (
            await post(
              '2fa/verify',
              { recoveryCode: codes[1].toUpperCase() },
              pending,
            )
          ).status,
          200,
        );
      },
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    try {
      await db.user.deleteMany({ where: { email } });
    } finally {
      await db.$disconnect();
    }
  }
});
