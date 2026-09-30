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
const columns = Prisma.sql`"id", "name", "phone", "photoUrl", "photoKey", "birthday", "reminder", "createdAt", "updatedAt"`;
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
  // One statement: the window count and the page share a snapshot and a
  // single database round trip.
  const rows = await db.$queryRaw<(PublicContact & { total: bigint })[]>(
    Prisma.sql`SELECT ${columns}, count(*) OVER() AS total FROM "Contact" WHERE ${filter}
      ORDER BY "name" COLLATE "contacts_alphabetic", "id" LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
  );
  const total = rows.length
    ? Number(rows[0].total)
    : page > 1
      ? Number(
          (
            await db.$queryRaw<{ total: bigint }[]>(
              Prisma.sql`SELECT count(*) AS total FROM "Contact" WHERE ${filter}`,
            )
          )[0].total,
        )
      : 0;
  const contacts: PublicContact[] = rows.map((row) =>
    Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'total')),
  ) as PublicContact[];
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
  const groups = await db.$queryRaw<
    { value: string; count: bigint; ids: string[]; total: bigint }[]
  >(Prisma.sql`${base}
    SELECT *, count(*) OVER() AS total FROM groups
    ORDER BY value COLLATE "contacts_alphabetic" LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);
  const total = groups.length
    ? Number(groups[0].total)
    : page > 1
      ? Number(
          (
            await db.$queryRaw<{ total: bigint }[]>(
              Prisma.sql`${base} SELECT count(*) AS total FROM groups`,
            )
          )[0].total,
        )
      : 0;
  // Owner-scoped; a contact deleted in between is simply left out of its group.
  const contacts = groups.length
    ? await db.contact.findMany({
        where: { userId, id: { in: groups.flatMap((g) => g.ids) } },
        select: contactSelect,
        orderBy: { id: 'asc' },
      })
    : [];
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
}
