import { parseCookie } from 'cookie';
import { Router, rateLimit } from '../http';
import { z } from 'zod';
import { getDatabase } from '../database/client';
import { getAuthConfig } from './config';
import type { AuthOptions } from './routes';
import { requireAuth, type AuthPrincipal } from './middleware';
import { cookieOptions, setSessionCookie } from './tokens';
import {
  confirmTwoFactor,
  completeTwoFactor,
  disableTwoFactor,
  setupTwoFactor,
} from './two-factor-service';

export const challengeCookieName = 'contacts_2fa_challenge';
export const challengeCookieOptions = (
  config: ReturnType<typeof getAuthConfig>,
) => ({ ...cookieOptions(config) });
const codeBody = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
const recoveryBody = z
  .object({
    recoveryCode: z
      .string()
      .trim()
      .regex(/^(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{8}){3})$/),
  })
  .strict();

// The password plus either a current code or a recovery code.
export const secondFactorBody = z
  .object({
    password: z.string().min(1).max(128),
    code: codeBody.shape.code.optional(),
    recoveryCode: recoveryBody.shape.recoveryCode.optional(),
  })
  .strict()
  .refine((v) => !(v.code && v.recoveryCode));
export const secondFactor = (v: { code?: string; recoveryCode?: string }) =>
  v.code
    ? { code: v.code }
    : v.recoveryCode
      ? { recoveryCode: v.recoveryCode }
      : null;

export function twoFactorRouter(options: AuthOptions) {
  const database = options.database ?? getDatabase;
  const config = options.config ?? getAuthConfig;
  const now = options.now ?? (() => new Date());
  const router = new Router();
  const authenticated = requireAuth(database, config);
  router.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: options.twoFactorLimit ?? 20,
      message: { error: 'TOO_MANY_REQUESTS' },
    }),
  );

  router.get('/status', authenticated, async (_request, response) => {
    const user = await database().user.findUniqueOrThrow({
      where: { id: (response.locals.auth as AuthPrincipal).user.id },
      select: { twoFactorEnabled: true, recoveryCodeHashes: true },
    });
    response.json({
      enabled: user.twoFactorEnabled,
      recoveryCodesRemaining: user.recoveryCodeHashes.length,
    });
  });
  router.post('/setup', authenticated, async (request, response) => {
    const parsed = z
      .object({ password: z.string().min(1).max(128) })
      .strict()
      .safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    const result = await setupTwoFactor(
      database(),
      response.locals.auth as AuthPrincipal,
      parsed.data.password,
      config(),
      now(),
    );
    if (!result.ok) {
      response.status(result.status).json({ error: result.error });
      return;
    }
    response.json({
      secret: result.secret,
      otpauthUri: result.otpauthUri,
      qrCodeDataUrl: result.qrCodeDataUrl,
      expiresAt: result.expiresAt,
    });
  });
  router.post('/confirm', authenticated, async (request, response) => {
    const parsed = codeBody.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    const settings = config();
    const result = await confirmTwoFactor(
      database(),
      response.locals.auth as AuthPrincipal,
      parsed.data.code,
      settings,
      now(),
    );
    if (!result.ok) {
      response.status(result.status).json({ error: result.error });
      return;
    }
    await setSessionCookie(
      response,
      result.user.id,
      result.session.id,
      settings,
      result.expiresAt,
    );
    response.clearCookie(challengeCookieName, challengeCookieOptions(settings));
    response.json({ enabled: true, recoveryCodes: result.recoveryCodes });
  });
  router.post('/disable', authenticated, async (request, response) => {
    const parsed = secondFactorBody.safeParse(request.body);
    const input = parsed.success ? secondFactor(parsed.data) : null;
    if (!parsed.success || !input) {
      response.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    const result = await disableTwoFactor(
      database(),
      response.locals.auth as AuthPrincipal,
      parsed.data.password,
      input,
      config(),
      now(),
    );
    if (!result.ok) {
      response.status(result.status).json({ error: result.error });
      return;
    }
    response.json({ enabled: false });
  });
  router.post('/verify', async (request, response) => {
    const parsed = z.union([codeBody, recoveryBody]).safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    const token = parseCookie(request.headers.cookie ?? '')[
      challengeCookieName
    ];
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      response.status(401).json({ error: 'INVALID_CHALLENGE' });
      return;
    }
    const settings = config();
    const result = await completeTwoFactor(
      database(),
      token,
      parsed.data,
      settings,
      now(),
    );
    if (!result.ok) {
      response.status(result.status).json({ error: result.error });
      return;
    }
    await setSessionCookie(
      response,
      result.user.id,
      result.session.id,
      settings,
      result.expiresAt,
    );
    response.clearCookie(challengeCookieName, challengeCookieOptions(settings));
    response.json({ user: result.user });
  });
  return router;
}
