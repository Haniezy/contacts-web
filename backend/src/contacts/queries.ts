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
const phoneDigits = Prisma.sql`regexp_replace(translate("phone", '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[^0-9]', '', 'g')`;
// Duplicates compare Iranian numbers in national form, so +98 912…, 0098 912…,
// 0912… and 912… are one number. Other numbers compare digit for digit.
const phoneKey = Prisma.sql`regexp_replace(regexp_replace(${phoneDigits}, '^(0098|98|0)([1-9][0-9]{9})$', '0\\2'), '^(9[0-9]{9})$', '0\\1')`;
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
    (${q === ''} OR position(${name} in ${nameKey}) > 0 OR (${phone !== ''} AND position(${phone} in ${phoneDigits}) > 0))`;
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
  // A phone group the user ignored stays hidden while no new member joins it.
  const ignored =
    by === 'phone'
      ? Prisma.sql`WHERE NOT EXISTS (SELECT 1 FROM "DuplicateIgnore" i
          WHERE i."userId" = ${userId}::uuid AND i."phone" = all_groups.value
          AND all_groups.all_ids <@ i."contactIds")`
      : Prisma.empty;
  const base = Prisma.sql`WITH all_groups AS (SELECT ${key} AS value, count(*) AS count,
    array_agg("id" ORDER BY "createdAt", "id") AS all_ids FROM "Contact"
    WHERE "userId" = ${userId}::uuid GROUP BY ${key} HAVING count(*) > 1 AND ${key} <> ''),
    groups AS (SELECT value, count, all_ids[1:20] AS ids FROM all_groups ${ignored})`;
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
        // The oldest version first: it is usually the original entry.
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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

// Hides the phone group of the given contacts until a new member joins it.
// Returns false when the contacts are not one phone group of this user.
export async function ignoreDuplicates(
  tx: Prisma.TransactionClient,
  userId: string,
  ids: string[],
) {
  const [chosen] = await tx.$queryRaw<{ count: bigint; keys: string[] }[]>(
    Prisma.sql`SELECT count(*) AS count, array_agg(DISTINCT ${phoneKey}) AS keys
      FROM "Contact" WHERE "userId" = ${userId}::uuid AND "id" = ANY(${ids}::uuid[])`,
  );
  if (Number(chosen.count) !== ids.length) return 'missing';
  if (chosen.keys.length !== 1 || chosen.keys[0] === '') return 'mismatch';
  const phone = chosen.keys[0];
  await tx.$executeRaw(
    Prisma.sql`INSERT INTO "DuplicateIgnore" ("userId", "phone", "contactIds")
      SELECT ${userId}::uuid, ${phone}, array_agg("id" ORDER BY "id") FROM "Contact"
      WHERE "userId" = ${userId}::uuid AND ${phoneKey} = ${phone}
      ON CONFLICT ("userId", "phone") DO UPDATE SET "contactIds" = EXCLUDED."contactIds", "createdAt" = now()`,
  );
  return 'ignored';
}
