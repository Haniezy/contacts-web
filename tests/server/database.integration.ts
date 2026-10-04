import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { createDatabaseClient } from '../../src/server/database/client';

const connectionString = process.env.DATABASE_TEST_URL;
if (!connectionString) {
  throw new Error(
    'Set DATABASE_TEST_URL explicitly to a development/test database',
  );
}
const database = createDatabaseClient(connectionString);
after(() => database.$disconnect());

function userData() {
  return {
    email: `integration-${randomUUID()}@contacts.example`,
    passwordHash: 'test-only-hash-never-committed-to-the-database',
  };
}

test('user defaults, contact fields, owner filtering, updates and cascade delete', async () => {
  const rollback = new Error('intentional test rollback');
  await assert.rejects(
    database.$transaction(
      async (transaction) => {
        const user = await transaction.user.create({ data: userData() });
        const otherUser = await transaction.user.create({ data: userData() });
        assert.equal(user.twoFactorEnabled, false);
        assert.equal(user.twoFactorSecretEncrypted, null);
        assert.deepEqual(user.recoveryCodeHashes, []);

        const contact = await transaction.contact.create({
          data: {
            userId: user.id,
            name: 'مخاطب آزمایشی',
            phone: '+12025550110',
            photoUrl: 'https://example.com/contact.png',
            birthday: new Date('2000-02-29T00:00:00.000Z'),
            reminder: 'یادداشت آزمایشی',
            // Force an earlier value so the updatedAt check cannot be a same-ms flake.
            updatedAt: new Date('2000-01-01T00:00:00.000Z'),
          },
        });
        assert.equal(
          contact.birthday?.toISOString(),
          '2000-02-29T00:00:00.000Z',
        );
        assert.equal(contact.photoUrl, 'https://example.com/contact.png');
        assert.equal(contact.reminder, 'یادداشت آزمایشی');
        assert.equal(
          await transaction.contact.count({ where: { userId: otherUser.id } }),
          0,
        );

        const minimal = await transaction.contact.create({
          data: {
            userId: user.id,
            name: 'Optional fields',
            phone: contact.phone,
          },
        });
        assert.equal(minimal.birthday, null);
        assert.equal(minimal.photoUrl, null);
        assert.equal(minimal.reminder, null);

        const updated = await transaction.contact.update({
          where: { id: contact.id },
          data: { name: 'نام ویرایش‌شده' },
        });
        assert.ok(updated.updatedAt > contact.updatedAt);
        assert.equal(updated.createdAt.getTime(), contact.createdAt.getTime());

        await transaction.user.delete({ where: { id: user.id } });
        assert.equal(
          await transaction.contact.count({ where: { userId: user.id } }),
          0,
        );
        throw rollback;
      },
      { timeout: 30000 },
    ),
    (error) => error === rollback,
  );
});

test('duplicate user emails are rejected by PostgreSQL', async () => {
  await assert.rejects(
    database.$transaction(async (transaction) => {
      const data = userData();
      await transaction.user.create({ data });
      await transaction.user.create({ data });
    }),
    { code: 'P2002' },
  );
});

test('contacts cannot reference a nonexistent user', async () => {
  await assert.rejects(
    database.$transaction(async (transaction) => {
      await transaction.contact.create({
        data: { userId: randomUUID(), name: 'Orphan', phone: '+12025550111' },
      });
    }),
    { code: 'P2003' },
  );
});

test('tenant-prefixed name and phone indexes exist in PostgreSQL', async () => {
  const indexes = await database.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'Contact'
  `;
  assert.ok(
    indexes.some(({ indexdef }) => indexdef.includes('("userId", name)')),
  );
  assert.ok(
    indexes.some(({ indexdef }) => indexdef.includes('("userId", phone)')),
  );
});
