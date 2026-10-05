import {
  Prisma,
  type PrismaClient,
  type Contact,
} from '../generated/prisma/client';
import {
  contactSelect,
  digits,
  normalizeName,
  normalizePhone,
} from './validation';

// Parameters are always bound. Only these fixed SQL fragments select expressions.
const nameKey = Prisma.sql`lower(trim(regexp_replace(translate("name", 'يك', 'یک'), '[[:space:]]+', ' ', 'g')))`;
const phoneDigits = Prisma.sql`regexp_replace(translate("phone", '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[^0-9]', '', 'g')`;
// Duplicates compare Iranian numbers in national form, so +98 912…, 0098 912…,
// 0912… and 912… are one number. Other numbers compare digit for digit.
const phoneKey = Prisma.sql`regexp_replace(regexp_replace(${phoneDigits}, '^(0098|98|0)([1-9][0-9]{9})$', '0\\2'), '^(9[0-9]{9})$', '0\\1')`;
// The first letter's script: Persian/Arabic letters (not digits), Latin.
const arabicFirst = '^\\s*[\u0621-\u064A\u066E-\u06D3\u06FA-\u06FF]';
const latinFirst = '^\\s*[A-Za-z\u00C0-\u024F]';
const columns = Prisma.sql`"id", "name", "phone", "photoUrl", "photoKey", "birthday", "reminder", "createdAt", "updatedAt"`;
type PublicContact = Pick<Contact, keyof typeof contactSelect>;

export async function listContacts(
  db: PrismaClient,
  userId: string,
  query: { q: string; page: number; pageSize: number },
  // Names in the page's own script come first, then the other script, then
  // names starting with a digit or symbol (the # group).
  locale: 'fa' | 'en' = 'fa',
) {
  const { q, page, pageSize } = query;
  const script = Prisma.sql`CASE WHEN "name" ~ ${arabicFirst} THEN ${locale === 'fa' ? 0 : 1}::int
    WHEN "name" ~ ${latinFirst} THEN ${locale === 'fa' ? 1 : 0}::int ELSE 2 END`;
  const name = normalizeName(q);
  const phone = /^[+0-9\s().-]+$/.test(digits(q)) ? normalizePhone(q) : '';
  const filter = Prisma.sql`"userId" = ${userId}::uuid AND
    (${q === ''} OR position(${name} in ${nameKey}) > 0 OR (${phone !== ''} AND position(${phone} in ${phoneDigits}) > 0))`;
  // One statement: the window count and the page share a snapshot and a
  // single database round trip.
  const rows = await db.$queryRaw<(PublicContact & { total: bigint })[]>(
    Prisma.sql`SELECT ${columns}, count(*) OVER() AS total FROM "Contact" WHERE ${filter}
      ORDER BY ${script}, "name" COLLATE "contacts_alphabetic", "id" LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
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

type Kind = 'phone' | 'name';
const keyOf = (kind: Kind) => (kind === 'name' ? nameKey : phoneKey);

// Groups of one kind with all member IDs, oldest first.
const groupsOf = (kind: Kind, userId: string) => {
  const key = keyOf(kind);
  return Prisma.sql`SELECT ${kind}::text AS by, ${key} AS value, count(*) AS count,
    array_agg("id" ORDER BY "createdAt", "id") AS all_ids FROM "Contact"
    WHERE "userId" = ${userId}::uuid GROUP BY ${key} HAVING count(*) > 1 AND ${key} <> ''`;
};

export async function duplicateContacts(
  db: PrismaClient,
  userId: string,
  query: { by: Kind | 'all'; page: number; pageSize: number },
) {
  const { by, page, pageSize } = query;
  // "all" lists phone groups, then name groups; a name group with exactly the
  // members of a phone group is the same group and is listed once.
  const candidates =
    by === 'all'
      ? Prisma.sql`phone_groups AS (${groupsOf('phone', userId)}),
        all_groups AS (SELECT * FROM phone_groups UNION ALL
          SELECT * FROM (${groupsOf('name', userId)}) n
          WHERE NOT EXISTS (SELECT 1 FROM phone_groups p WHERE p.all_ids = n.all_ids))`
      : Prisma.sql`all_groups AS (${groupsOf(by, userId)})`;
  // An ignored group stays hidden while no new member joins it.
  const base = Prisma.sql`WITH ${candidates},
    groups AS (SELECT by, value, count, all_ids[1:20] AS ids FROM all_groups g
      WHERE NOT EXISTS (SELECT 1 FROM "DuplicateIgnore" i
        WHERE i."userId" = ${userId}::uuid AND i."by" = g.by AND i."value" = g.value
        AND g.all_ids <@ i."contactIds"))`;
  const groups = await db.$queryRaw<
    { by: Kind; value: string; count: bigint; ids: string[]; total: bigint }[]
  >(Prisma.sql`${base}
    SELECT *, count(*) OVER() AS total FROM groups
    ORDER BY by = 'phone' DESC, value COLLATE "contacts_alphabetic", by
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);
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
      by: g.by,
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

// Hides the phone or name group of the given contacts until a new member
// joins it. The contacts must be exactly one such group of this user.
export async function ignoreDuplicates(
  tx: Prisma.TransactionClient,
  userId: string,
  { by, contactIds }: { by: Kind; contactIds: string[] },
) {
  const key = keyOf(by);
  const [chosen] = await tx.$queryRaw<{ count: bigint; keys: string[] }[]>(
    Prisma.sql`SELECT count(*) AS count, array_agg(DISTINCT ${key}) AS keys
      FROM "Contact" WHERE "userId" = ${userId}::uuid AND "id" = ANY(${contactIds}::uuid[])`,
  );
  if (Number(chosen.count) !== contactIds.length) return 'missing';
  if (chosen.keys.length !== 1 || chosen.keys[0] === '') return 'mismatch';
  const value = chosen.keys[0];
  await tx.$executeRaw(
    Prisma.sql`INSERT INTO "DuplicateIgnore" ("userId", "by", "value", "contactIds")
      SELECT ${userId}::uuid, ${by}, ${value}, array_agg("id" ORDER BY "id") FROM "Contact"
      WHERE "userId" = ${userId}::uuid AND ${key} = ${value}
      ON CONFLICT ("userId", "by", "value") DO UPDATE SET "contactIds" = EXCLUDED."contactIds", "createdAt" = now()`,
  );
  return 'ignored';
}
