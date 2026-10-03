import { Router, json } from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { getDatabase } from '../database/client.js';
import { getAuthConfig } from './config.js';
import { requireAuth, type AuthPrincipal } from './middleware.js';
import { hashPassword, verifyPassword } from './password.js';
import { issueLogin } from './two-factor-service.js';
import { emailSuggestion } from './email-typo.js';
import { firstName, lastName, newPassword } from './account-rules.js';
import { cloudinaryPhotos, type PhotoStore } from '../contacts/photos.js';
import {
  challengeCookieName,
  challengeCookieOptions,
  twoFactorRouter,
} from './two-factor-routes.js';
import {
  cookieName,
  cookieOptions,
  sessionSeconds,
  setSessionCookie,
} from './tokens.js';

export interface AuthOptions {
  database?: typeof getDatabase;
  config?: typeof getAuthConfig;
  loginLimit?: number;
  twoFactorLimit?: number;
  now?: () => Date;
}

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const signupBody = z
  .object({
    // A misspelt popular domain (gmial.com) is refused.
    email: email.refine((value) => !emailSuggestion(value)),
    password: newPassword,
    firstName: firstName.optional(),
    lastName: lastName.optional(),
  })
  .strict();
const loginBody = z
  .object({ email, password: z.string().min(1).max(128) })
  .strict();
const publicUser = { id: true, email: true } as const;

// The profile as clients see it: a short-lived signed photo URL, never the key.
export async function presentUser(
  user: AuthPrincipal['user'],
  photos: () => PhotoStore,
) {
  const { photoKey, ...fields } = user;
  if (photoKey && !photoKey.startsWith(`contacts/${user.id}/`))
    throw new Error('Invalid photo reference');
  return {
    ...fields,
    photoUrl: photoKey ? await photos().url(photoKey) : null,
  };
}

export function authRouter(
  options: AuthOptions = {},
  photos: () => PhotoStore = cloudinaryPhotos,
) {
  const database = options.database ?? getDatabase;
  const config = options.config ?? getAuthConfig;
  const router = Router();
  const authenticated = requireAuth(database, config);

  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use((request, response, next) => {
    const origin = request.get('Origin');
    if (origin && origin !== config().origin) {
      response.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' });
      return;
    }
    next();
  });
  router.use(
    cors((request, callback) =>
      callback(null, {
        origin: request.headers.origin ? config().origin : false,
        credentials: true,
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
      }),
    ),
  );
  router.use((request, response, next) => {
    if (
      request.method === 'POST' &&
      request.get('Content-Type')?.split(';')[0]?.trim() !== 'application/json'
    ) {
      response.status(415).json({ error: 'JSON_REQUIRED' });
      return;
    }
    next();
  });

  const limiter = (limit: number, windowMs: number) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'TOO_MANY_REQUESTS' },
    });
  router.use('/login', limiter(options.loginLimit ?? 10, 15 * 60 * 1000));
  router.use('/signup', limiter(5, 60 * 60 * 1000));
  router.use(json({ limit: '8kb' }));

  router.post('/signup', async (request, response) => {
    const parsed = signupBody.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: 'INVALID_INPUT',
        fields: z.flattenError(parsed.error).fieldErrors,
      });
      return;
    }
    const settings = config();
    const passwordHash = await hashPassword(parsed.data.password);
    const expiresAt = new Date(Date.now() + sessionSeconds * 1000);
    try {
      const result = await database().$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            email: parsed.data.email,
            passwordHash,
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
          },
          select: publicUser,
        });
        const session = await transaction.authSession.create({
          data: { userId: user.id, expiresAt },
          select: { id: true },
        });
        return { user, session };
      });
      await setSessionCookie(
        response,
        result.user.id,
        result.session.id,
        settings,
        expiresAt,
      );
      response.status(201).json({ user: result.user });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        response.status(409).json({ error: 'EMAIL_ALREADY_EXISTS' });
        return;
      }
      throw error;
    }
  });

  router.post('/login', async (request, response) => {
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    const settings = config();
    const user = await database().user.findUnique({
      where: { email: parsed.data.email },
      select: { ...publicUser, passwordHash: true, twoFactorEnabled: true },
    });
    if (
      !(await verifyPassword(parsed.data.password, user?.passwordHash)) ||
      !user
    ) {
      response.status(401).json({ error: 'INVALID_CREDENTIALS' });
      return;
    }
    const result = await issueLogin(
      database(),
      user.id,
      user.passwordHash,
      options.now?.() ?? new Date(),
    );
    if (!result.ok) {
      response.status(result.status).json({ error: result.error });
      return;
    }
    if (result.kind === 'challenge') {
      response.clearCookie(cookieName, cookieOptions(settings));
      response.cookie(challengeCookieName, result.token, {
        ...challengeCookieOptions(settings),
        expires: result.expiresAt,
      });
      response.status(202).json({ twoFactorRequired: true });
      return;
    }
    response.clearCookie(challengeCookieName, challengeCookieOptions(settings));
    await setSessionCookie(
      response,
      result.user.id,
      result.session.id,
      settings,
      result.expiresAt,
    );
    response.json({ user: result.user });
  });

  router.use('/2fa', twoFactorRouter(options));

  router.get('/me', authenticated, async (_request, response) => {
    response.json({
      user: await presentUser(
        (response.locals.auth as AuthPrincipal).user,
        photos,
      ),
    });
  });

  router.post('/logout', authenticated, async (_request, response) => {
    await database().authSession.deleteMany({
      where: { id: (response.locals.auth as AuthPrincipal).sessionId },
    });
    response.clearCookie(cookieName, cookieOptions(config()));
    response.status(204).end();
  });

  return router;
}
