import { createHash, randomBytes, scrypt } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client';

const seedEmail = 'seed@contacts.example';

async function makePasswordHash() {
  // The demo account has a random, discarded password; no shared default login.
  const password = randomBytes(32);
  const salt = randomBytes(16);
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
  return `scrypt$131072$8$1$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

function seedContactId(userId: string, key: string) {
  // Stable UUID-shaped IDs make reruns safe, even if demo contacts are edited.
  const hex = createHash('sha256')
    .update(`${userId}:seed:${key}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function seedDatabase(database: PrismaClient) {
  const passwordHash = await makePasswordHash();

  return database.$transaction(async (transaction) => {
    const user = await transaction.user.upsert({
      where: { email: seedEmail },
      update: {},
      create: { email: seedEmail, passwordHash },
      select: { id: true },
    });

    const samples = [
      {
        key: 'first',
        name: 'مخاطب نمونه اول',
        phone: '+12025550101',
        birthday: new Date('1995-06-15T00:00:00.000Z'),
        reminder: 'این یک یادداشت نمونه است.',
      },
      { key: 'second', name: 'Sample Contact', phone: '+12025550102' },
    ];

    for (const { key, ...contact } of samples) {
      await transaction.contact.upsert({
        where: { id: seedContactId(user.id, key) },
        update: {},
        create: {
          id: seedContactId(user.id, key),
          userId: user.id,
          ...contact,
        },
      });
    }

    return { userId: user.id, contacts: samples.length };
  });
}
