import {
  Prisma,
  type PrismaClient,
  type Contact,
} from '../generated/prisma/client.js';
import {
  contactSelect,
  digits,
  normalizeName,
  normalizePhone,
} from './validation.js';

// Parameters are always bound. Only these fixed SQL fragments select expressions.
const nameKey = Prisma.sql`lower(trim(regexp_replace(translate("name", 'يك', 'یک'), '[[:space:]]+', ' ', 'g')))`;
const phoneKey = Prisma.sql`regexp_replace(translate("phone", '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[^0-9]', '', 'g')`;
const columns = Prisma.sql`"id", "name", "phone", "photoUrl", "birthday", "reminder", "createdAt", "updatedAt"`;
type PublicContact = Pick<Contact, keyof typeof contactSelect>;

export async function listContacts(
  db: PrismaClient,
  userId: string,
  query: { q: string; page: number; pageSize: number },
) {
  const { q, page, pageSize } = query;
  const name = normalizeName(q);
  const phone = /^[+0-9\s().-]+$/.test(digits(q)) ? normalizePhone(q) : '';
  const filter = Prisma.sql`"userId" = ${userId}::uuid AND
    (${q === ''} OR position(${name} in ${nameKey}) > 0 OR (${phone !== ''} AND position(${phone} in ${phoneKey}) > 0))`;
  const [contacts, count] = await db.$transaction(
    [
      db.$queryRaw<
        PublicContact[]
      >(Prisma.sql`SELECT ${columns} FROM "Contact" WHERE ${filter}
      ORDER BY "name" COLLATE "contacts_alphabetic", "id" LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
      db.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT count(*) AS total FROM "Contact" WHERE ${filter}`,
      ),
    ],
    { isolationLevel: 'RepeatableRead' },
  );
  const total = Number(count[0].total);
  return {
    contacts,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function duplicateContacts(
  db: PrismaClient,
  userId: string,
  query: { by: 'name' | 'phone'; page: number; pageSize: number },
) {
  const { by, page, pageSize } = query;
  const key = by === 'name' ? nameKey : phoneKey;
  const base = Prisma.sql`WITH groups AS (SELECT ${key} AS value, count(*) AS count,
    (array_agg("id" ORDER BY "id"))[1:20] AS ids FROM "Contact"
    WHERE "userId" = ${userId}::uuid GROUP BY ${key} HAVING count(*) > 1 AND ${key} <> '')`;
  return db.$transaction(
    async (tx) => {
      const groups = await tx.$queryRaw<
        { value: string; count: bigint; ids: string[] }[]
      >(Prisma.sql`${base}
      SELECT * FROM groups ORDER BY value COLLATE "contacts_alphabetic" LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);
      const count = await tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`${base} SELECT count(*) AS total FROM groups`,
      );
      const contacts = await tx.contact.findMany({
        where: { userId, id: { in: groups.flatMap((g) => g.ids) } },
        select: contactSelect,
        orderBy: { id: 'asc' },
      });
      const total = Number(count[0].total);
      return {
        groups: groups.map((g) => ({
          by,
          value: g.value,
          count: Number(g.count),
          hasMore: Number(g.count) > g.ids.length,
          contacts: contacts.filter((c) => g.ids.includes(c.id)),
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
