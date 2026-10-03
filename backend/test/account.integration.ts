import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { generate } from 'otplib';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/database/client.js';

const connectionString = process.env.DATABASE_TEST_URL;
if (!connectionString)
  throw new Error(
    'Set DATABASE_TEST_URL to a migrated development/test database',
  );

test('profile, password, photo, 2FA off, sign out everywhere and account deletion', async (t) => {
  const db = createDatabaseClient(connectionString);
  const config = {
    secret: randomBytes(48),
    twoFactorKey: randomBytes(32),
    origin: 'http://localhost:3000',
    secureCookie: false,
  };
  const removed: string[] = [];
  const photos = () => ({
    upload: async (_buffer: Buffer, userId: string) => ({
      key: `contacts/${userId}/cloudinary/${randomUUID()}`,
    }),
    remove: async (key: string) => {
      removed.push(key);
    },
    url: async (key: string) => `https://photos.example/${key}?signed`,
  });
  let clock = Date.now();
  const server = createApp(
    async () => {},
    {
      database: () => db,
      config: () => config,
      loginLimit: 100,
      twoFactorLimit: 100,
      now: () => new Date(clock),
    },
    { photos },
  ).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const email = `account-test-${randomUUID()}@contacts.example`;
  let password = randomBytes(9).toString('base64url');
  const request = (
    method: string,
    path: string,
    cookie: string,
    body?: unknown,
    origin = config.origin,
  ) =>
    fetch(`${base}/${path}`, {
      method,
      headers: {
        Cookie: cookie,
        Origin: origin,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const session = (response: Response) =>
    response.headers
      .getSetCookie()
      .find((value) => value.startsWith('contacts_session='))!
      .split(';')[0];
  const me = async (cookie: string) => {
    const response = await request('GET', 'auth/me', cookie);
    return { status: response.status, user: (await response.json()).user };
  };
  const login = async () =>
    session(await request('POST', 'auth/login', '', { email, password }));

  try {
    const signup = await request('POST', 'auth/signup', '', {
      email,
      password,
      firstName: 'سارا',
    });
    assert.equal(signup.status, 201);
    let a = session(signup);
    const b = await login();

    await t.test('name changes are validated and owner-scoped', async () => {
      // First names take 2–16 characters and last names 2–28.
      for (const body of [
        { firstName: ' ', lastName: 'احمدی' },
        { firstName: 'سارا' },
        { firstName: 'س', lastName: 'احمدی' },
        { firstName: 'س'.repeat(17), lastName: 'احمدی' },
        { firstName: 'سارا', lastName: 'ا' },
        { firstName: 'سارا', lastName: 'ا'.repeat(29) },
      ])
        assert.equal((await request('PATCH', 'account', a, body)).status, 400);
      assert.equal(
        (
          await request(
            'PATCH',
            'account',
            a,
            { firstName: 'x', lastName: '' },
            'https://evil.example',
          )
        ).status,
        403,
      );
      const response = await request('PATCH', 'account', a, {
        firstName: ' سارا ',
        lastName: 'احمدی',
      });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).user, {
        id: (await me(a)).user.id,
        email,
        firstName: 'سارا',
        lastName: 'احمدی',
        photoUrl: null,
      });
    });

    await t.test('a new password ends other sessions only', async () => {
      const change = (currentPassword: string, newPassword: string) =>
        request('POST', 'account/password', a, {
          currentPassword,
          newPassword,
        });
      assert.equal(
        (await change('wrong-password', 'new password 1')).status,
        401,
      );
      assert.equal((await change(password, 'short')).status, 400);
      assert.equal((await change(password, 'x'.repeat(17))).status, 400);
      const next = randomBytes(9).toString('base64url');
      assert.equal((await change(password, next)).status, 204);
      password = next;
      assert.equal((await me(a)).status, 200);
      assert.equal((await me(b)).status, 401);
      assert.equal((await me(await login())).status, 200);
    });

    await t.test('the profile photo is replaced and removed', async () => {
      const png = await sharp({
        create: { width: 8, height: 8, channels: 3, background: '#123456' },
      })
        .png()
        .toBuffer();
      const upload = async () => {
        const form = new FormData();
        form.append('photo', new Blob([png], { type: 'image/png' }), 'p.png');
        const response = await fetch(`${base}/account/photo`, {
          method: 'POST',
          headers: { Cookie: a, Origin: config.origin },
          body: form,
        });
        assert.equal(response.status, 200);
        return (await response.json()).user.photoUrl as string;
      };
      const first = await upload();
      assert.match(first, /^https:\/\/photos\.example\/contacts\//);
      assert.equal((await me(a)).user.photoUrl, first);
      await upload();
      assert.equal(removed.length, 1);
      const cleared = await request('DELETE', 'account/photo', a);
      assert.equal((await cleared.json()).user.photoUrl, null);
      assert.equal(removed.length, 2);
    });

    let secret = '';
    const totp = () =>
      generate({
        secret,
        epoch: Math.floor(clock / 1000),
        digits: 6,
        period: 30,
      });
    const enable = async () => {
      const setup = await request('POST', 'auth/2fa/setup', a, { password });
      secret = (await setup.json()).secret;
      const confirm = await request('POST', 'auth/2fa/confirm', a, {
        code: await totp(),
      });
      assert.equal(confirm.status, 200);
      a = session(confirm);
      clock += 30_000;
    };

    await t.test(
      '2FA turns off only with the password and a code',
      async () => {
        await enable();
        const disable = (body: unknown) =>
          request('POST', 'auth/2fa/disable', a, body);
        assert.equal((await disable({ password })).status, 400);
        assert.equal(
          (await disable({ password: 'wrong', code: await totp() })).status,
          401,
        );
        assert.equal((await disable({ password, code: '000000' })).status, 401);
        const off = await disable({ password, code: await totp() });
        assert.equal(off.status, 200);
        const status = await request('GET', 'auth/2fa/status', a);
        assert.equal((await status.json()).enabled, false);
        assert.equal(
          (await disable({ password, code: await totp() })).status,
          409,
        );
      },
    );

    await t.test('signing out everywhere ends every session', async () => {
      const other = await login();
      const response = await request('POST', 'account/logout-all', a, {});
      assert.equal(response.status, 204);
      assert.match(
        response.headers.get('set-cookie') ?? '',
        /Expires=Thu, 01 Jan 1970/,
      );
      assert.equal((await me(a)).status, 401);
      assert.equal((await me(other)).status, 401);
      a = await login();
    });

    await t.test(
      'deleting the account needs the password and the 2FA code',
      async () => {
        const contact = await request('POST', 'contacts', a, {
          name: 'Photo',
          phone: '09120000000',
        });
        const { id } = (await contact.json()).contact;
        await db.contact.update({
          where: { id },
          data: {
            photoKey: `contacts/${(await me(a)).user.id}/cloudinary/${randomUUID()}`,
          },
        });
        await enable();
        const remove = (body: unknown) =>
          request('POST', 'account/delete', a, body);
        assert.equal((await remove({ password: 'wrong' })).status, 401);
        assert.equal((await remove({ password })).status, 400);
        assert.equal((await remove({ password, code: '000000' })).status, 401);
        const before = removed.length;
        const done = await remove({ password, code: await totp() });
        assert.equal(done.status, 204);
        assert.equal(await db.user.count({ where: { email } }), 0);
        assert.equal(await db.contact.count({ where: { id } }), 0);
        assert.equal((await me(a)).status, 401);
        // Cleanup runs right after the response.
        await new Promise((resolve) => setTimeout(resolve, 200));
        assert.equal(removed.length, before + 1);
      },
    );
  } finally {
    await db.user.deleteMany({ where: { email } });
    server.close();
    await db.$disconnect();
  }
});
