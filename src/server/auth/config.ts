import { z } from 'zod';

export interface AuthConfig {
  secret: Uint8Array;
  origin: string;
  secureCookie: boolean;
  twoFactorKey?: Uint8Array;
}

const environment = z.object({
  JWT_SECRET: z.string().min(32),
  APP_ORIGIN: z.url().default('http://localhost:3000'),
  AUTH_COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  NODE_ENV: z.string().optional(),
  TWO_FACTOR_ENCRYPTION_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/)
      .optional(),
  ),
});

export function getAuthConfig(): AuthConfig {
  const parsed = environment.safeParse(process.env);
  if (!parsed.success)
    throw new Error('Authentication configuration is invalid');
  const { JWT_SECRET, APP_ORIGIN, AUTH_COOKIE_SECURE, NODE_ENV } = parsed.data;
  const origin = new URL(APP_ORIGIN);
  if (!['http:', 'https:'].includes(origin.protocol)) {
    throw new Error('APP_ORIGIN must use HTTP or HTTPS');
  }
  return {
    twoFactorKey: parsed.data.TWO_FACTOR_ENCRYPTION_KEY
      ? Buffer.from(parsed.data.TWO_FACTOR_ENCRYPTION_KEY, 'hex')
      : undefined,
    secret: new TextEncoder().encode(JWT_SECRET),
    origin: origin.origin,
    secureCookie: AUTH_COOKIE_SECURE
      ? AUTH_COOKIE_SECURE === 'true'
      : NODE_ENV === 'production',
  };
}
