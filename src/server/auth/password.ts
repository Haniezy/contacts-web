import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

export function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}

let dummyHash: Promise<string> | undefined;

export async function verifyPassword(password: string, passwordHash?: string) {
  // Unknown accounts and the old demo-only scrypt seed still perform a hash check.
  const supported = passwordHash?.startsWith('$argon2id$');
  const hash =
    passwordHash && supported
      ? passwordHash
      : await (dummyHash ??= hashPassword(randomBytes(32).toString('hex')));
  try {
    const valid = await argon2.verify(hash, password);
    return Boolean(supported && valid);
  } catch {
    return false;
  }
}
