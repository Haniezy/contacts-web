import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  decryptSecret,
  encryptSecret,
  recoveryCodes,
  recoveryHash,
  verifyTotp,
} from '../src/auth/two-factor-crypto.js';

const config = {
  secret: randomBytes(48),
  twoFactorKey: randomBytes(32),
  origin: 'https://contacts.example',
  secureCookie: true,
};

test('TOTP secrets are authenticated, randomized, and bound to the account', () => {
  const id = randomUUID();
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const encrypted = encryptSecret(secret, id, config);
  assert.notEqual(encrypted, encryptSecret(secret, id, config));
  assert.equal(encrypted.includes(secret), false);
  assert.equal(decryptSecret(encrypted, id, config), secret);
  assert.throws(() => decryptSecret(encrypted, randomUUID(), config));
  assert.throws(() =>
    decryptSecret(encrypted, id, { ...config, twoFactorKey: randomBytes(32) }),
  );
  const changed =
    encrypted.slice(0, -1) + (encrypted.endsWith('0') ? '1' : '0');
  assert.throws(() => decryptSecret(changed, id, config));
});

test('TOTP follows the RFC 6238 SHA1 vector and disallows reused time steps', async () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(await verifyTotp(secret, '287082', new Date(59000), null), 1);
  assert.equal(await verifyTotp(secret, '287082', new Date(59000), 1), null);
  assert.equal(
    await verifyTotp(secret, '287082', new Date(180000), null),
    null,
  );
});

test('recovery codes have 128 bits of randomness and account-specific hashes', () => {
  const userId = randomUUID();
  const generated = recoveryCodes(userId);
  assert.equal(new Set(generated.codes).size, 10);
  for (const [index, code] of generated.codes.entries()) {
    assert.match(code, /^[a-f0-9]{8}(?:-[a-f0-9]{8}){3}$/);
    assert.equal(
      generated.hashes[index],
      recoveryHash(userId, code.toUpperCase()),
    );
    assert.notEqual(generated.hashes[index], recoveryHash(randomUUID(), code));
    assert.notEqual(generated.hashes[index], code.replaceAll('-', ''));
  }
});
