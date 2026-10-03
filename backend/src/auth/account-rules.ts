import { z } from 'zod';

// Rules for what a user sets on signup and in the profile: passwords of 6–16
// characters, first names of 2–16 and last names of 2–28. Logins and password
// checks still accept any stored password up to 128 characters.
const name = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !/\p{Cc}/u.test(value));
export const newPassword = z.string().min(6).max(16);
export const firstName = name(2, 16);
export const lastName = name(2, 28);
