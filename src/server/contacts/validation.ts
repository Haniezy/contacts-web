import { z } from 'zod';
import { tagColors } from '../../lib/contacts';

export const digits = (value: string) =>
  value.replace(/[۰-۹٠-٩]/g, (char) =>
    String(char.charCodeAt(0) - (char >= '۰' ? 1776 : 1632)),
  );
export const normalizeName = (value: string) =>
  value
    .replaceAll('ي', 'ی')
    .replaceAll('ك', 'ک')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
export const normalizePhone = (value: string) =>
  digits(value).replace(/[^0-9]/g, '');
const name = z
  .string()
  .trim()
  .min(2)
  .max(28)
  .refine((v) =>
    [...v].every(
      (char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127,
    ),
  );
const phone = z
  .string()
  .trim()
  .max(32)
  .transform(digits)
  .refine(
    (v) =>
      /^\+?[0-9\s().-]+$/.test(v) && /^[0-9]{3,15}$/.test(normalizePhone(v)),
  )
  .transform((v) => `${v.startsWith('+') ? '+' : ''}${normalizePhone(v)}`);
const birthday = z.iso.date().nullable().optional();
const reminder = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => !v.includes('\0'))
  .nullable()
  .optional();
export const idSchema = z.uuid().transform((value) => value.toLowerCase());
// The tags a contact carries, all of them (an edit replaces the set). IDs
// of tags since deleted are dropped by the API, not refused, so an edit
// made offline still goes through.
export const tagIds = z
  .array(idSchema)
  .max(30)
  .transform((ids) => [...new Set(ids)]);
const fields = z.object({ name, phone, birthday, reminder }).strict();
const contactFields = fields.extend({ tagIds: tagIds.optional() }).strict();
// A new contact may bring its own ID: the app makes one up front, so a
// save made offline (or retried after a lost reply) is created only once.
export const createBody = contactFields
  .extend({ id: idSchema.optional() })
  .strict();
export const patchBody = contactFields
  .partial()
  .refine((v) => Object.keys(v).length > 0);
const page = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .transform(Number)
  .pipe(z.number().int().max(10000))
  .default(1);
const pageSize = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .transform(Number)
  .pipe(z.number().int().max(100))
  .default(20);
export const listQuery = z
  .object({
    q: z
      .string()
      .trim()
      .max(200)
      .refine((value) => !value.includes('\0'))
      .default(''),
    // Only contacts carrying this tag.
    tag: idSchema.optional(),
    page,
    pageSize,
  })
  .strict();
export const duplicateQuery = z
  .object({
    by: z.enum(['phone', 'name', 'all']).default('phone'),
    page,
    pageSize,
  })
  .strict();
// "Is this number already in the book?" while a contact is being typed.
export const matchQuery = z
  .object({
    phone: z
      .string()
      .max(32)
      .transform(normalizePhone)
      .pipe(z.string().regex(/^[0-9]{3,15}$/)),
    except: idSchema.optional(),
  })
  .strict();
export const mergeBody = z
  .object({
    targetId: idSchema,
    sourceIds: z.array(idSchema).min(1).max(19),
    overrides: fields.partial().optional(),
  })
  .strict()
  .refine(
    (v) =>
      new Set([v.targetId, ...v.sourceIds]).size === v.sourceIds.length + 1,
  );
export const ignoreBody = z
  .object({
    by: z.enum(['phone', 'name']).default('phone'),
    contactIds: z.array(idSchema).min(2).max(20),
  })
  .strict()
  .refine((v) => new Set(v.contactIds).size === v.contactIds.length);
export const tagLimit = 30;
const tagName = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .refine((v) =>
    [...v].every(
      (char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127,
    ),
  );
export const tagBody = z
  .object({ name: tagName, color: z.enum(tagColors) })
  .strict();
export const tagPatch = tagBody
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export const contactSelect = {
  id: true,
  name: true,
  phone: true,
  photoUrl: true,
  photoKey: true,
  birthday: true,
  reminder: true,
  shareToken: true,
  createdAt: true,
  updatedAt: true,
  tags: { select: { tagId: true } },
} as const;
