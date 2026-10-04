import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '../../src/server/auth/password';
import {
  cookieOptions,
  createToken,
  verifyToken,
} from '../../src/server/auth/tokens';

const config = {
  secret: randomBytes(48),
  origin: 'https://contacts.example',
  secureCookie: true,
};

test('Argon2id uses different salts and verifies only the matching password', async () => {
  const password = 'A long password for this test';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.match(first, /^\$argon2id\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('incorrect password', first), false);
  assert.equal(await verifyPassword(password), false);
});

test('JWT verifies identity and rejects expired tokens and wrong signing keys', async () => {
  const userId = randomUUID();
  const sessionId = randomUUID();
  const token = await createToken(
    userId,
    sessionId,
    config,
    new Date(Date.now() + 60000),
  );
  assert.deepEqual(await verifyToken(token, config), {
    sub: userId,
    jti: sessionId,
  });
  await assert.rejects(
    verifyToken(token, { ...config, secret: randomBytes(48) }),
  );
  const expired = await createToken(
    userId,
    sessionId,
    config,
    new Date(Date.now() - 10000),
  );
  await assert.rejects(verifyToken(expired, config));
  assert.deepEqual(cookieOptions(config), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
});
