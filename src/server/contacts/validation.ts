import { z } from 'zod';

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
export const createBody = z
  .object({ name, phone, birthday, reminder })
  .strict();
export const patchBody = createBody
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export const idSchema = z.uuid().transform((value) => value.toLowerCase());
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
export const mergeBody = z
  .object({
    targetId: idSchema,
    sourceIds: z.array(idSchema).min(1).max(19),
    overrides: createBody.partial().optional(),
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
} as const;
