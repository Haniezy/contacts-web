import console from 'node:console';
import process from 'node:process';
import { TextEncoder } from 'node:util';
import '../dist/config/env.js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { generate } from 'otplib';
import { createDatabaseClient } from '../dist/database/client.js';
import { hashPassword } from '../dist/auth/password.js';
import { createToken } from '../dist/auth/tokens.js';

const input = JSON.parse(readFileSync(0, 'utf8'));
if (input.action === 'totp') {
  console.log(
    JSON.stringify(
      await generate({
        secret: input.secret,
        epoch: Math.floor(Date.now() / 1000) + (input.offset ?? 0),
      }),
    ),
  );
} else {
  if (!process.env.DATABASE_TEST_URL)
    throw new Error('DATABASE_TEST_URL is required');
  const db = createDatabaseClient(process.env.DATABASE_TEST_URL);
  try {
    if (input.action === 'create') {
      const email = `browser-test-${randomUUID()}@contacts.example`;
      const password = 'Browser test password 123!';
      const user = await db.user.create({
        data: { email, passwordHash: await hashPassword(password) },
      });
      const expiresAt = new Date(Date.now() + 3600000);
      const session = await db.authSession.create({
        data: { userId: user.id, expiresAt },
      });
      const token = await createToken(
        user.id,
        session.id,
        {
          secret: new TextEncoder().encode(
            'browser-tests-only-signing-secret-48-characters-long',
          ),
          origin: 'http://127.0.0.1:3100',
          secureCookie: false,
        },
        expiresAt,
      );
      console.log(JSON.stringify({ email, password, token }));
    } else {
      if (!/^browser-test-[a-f0-9-]{36}@contacts\.example$/.test(input.email))
        throw new Error(
          'Only exact temporary browser test accounts can be inspected or removed',
        );
      if (input.action === 'delete')
        await db.user.deleteMany({ where: { email: input.email } });
      else if (input.action === 'names')
        console.log(
          JSON.stringify(
            await db.user.findUniqueOrThrow({
              where: { email: input.email },
              select: { firstName: true, lastName: true },
            }),
          ),
        );
    }
  } finally {
    await db.$disconnect();
  }
}
