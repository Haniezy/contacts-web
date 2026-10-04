import { Router, json, rateLimit } from '../http';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { getDatabase } from '../database/client';
import { getAuthConfig } from '../auth/config';
import { requireAuth, type AuthPrincipal } from '../auth/middleware';
import { hashPassword, verifyPassword } from '../auth/password';
import { cookieName, cookieOptions } from '../auth/tokens';
import { presentUser, type AuthOptions } from '../auth/routes';
import { checkSecondFactor } from '../auth/two-factor-service';
import { secondFactor, secondFactorBody } from '../auth/two-factor-routes';
import { firstName, lastName, newPassword } from '../auth/account-rules';
import {
  cleanupPhotos,
  cloudinaryPhotos,
  ContactError,
  photoField,
  preparePhoto,
} from '../contacts/photos';
import type { ContactOptions } from '../contacts/routes';

const profileBody = z.object({ firstName, lastName }).strict();
const passwordBody = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword,
  })
  .strict();
const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  photoKey: true,
} as const;

// The signed-in user's own account: profile, password, photo, sessions and
// deletion. Every change is scoped to the session's user.
export function accountRouter(
  auth: AuthOptions = {},
  options: ContactOptions = {},
) {
  const database = auth.database ?? getDatabase;
  const config = auth.config ?? getAuthConfig;
  const photos = options.photos ?? cloudinaryPhotos;
  const router = new Router();
  const principal = (locals: Record<string, unknown>) =>
    locals.auth as AuthPrincipal;
  const lockUser = (tx: Prisma.TransactionClient, id: string) =>
    tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id}::uuid FOR UPDATE`;
  const limiter = (limit: number) =>
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit,
      message: { error: 'TOO_MANY_REQUESTS' },
    });

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const origin = req.get('Origin');
    if (
      (origin && origin !== config().origin) ||
      req.get('Sec-Fetch-Site') === 'cross-site'
    ) {
      res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' });
      return;
    }
    // Multipart is a browser-simple request: require explicit trusted origin.
    if (req.is('multipart/form-data') && origin !== config().origin) {
      res.status(403).json({ error: 'ORIGIN_REQUIRED' });
      return;
    }
    next();
  });
  router.use(requireAuth(database, config));
  router.use((req, res, next) => {
    if (
      ['POST', 'PATCH'].includes(req.method) &&
      !req.is('application/json') &&
      !(req.path === '/photo' && req.is('multipart/form-data'))
    ) {
      res.status(415).json({ error: 'JSON_REQUIRED' });
      return;
    }
    next();
  });
  router.use(json({ limit: 8 * 1024 }));

  router.patch('/', async (req, res) => {
    const body = profileBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    const user = await database().user.update({
      where: { id: principal(res.locals).user.id },
      data: body.data,
      select: userSelect,
    });
    res.json({ user: await presentUser(user, photos) });
  });

  // A new password ends every other session; this one stays signed in.
  router.post('/password', limiter(10), async (req, res) => {
    const body = passwordBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    const { user: me, sessionId } = principal(res.locals);
    const user = await database().user.findUniqueOrThrow({
      where: { id: me.id },
      select: { passwordHash: true },
    });
    if (!(await verifyPassword(body.data.currentPassword, user.passwordHash))) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      return;
    }
    const passwordHash = await hashPassword(body.data.newPassword);
    const changed = await database().$transaction(async (tx) => {
      await lockUser(tx, me.id);
      const current = await tx.user.findUniqueOrThrow({
        where: { id: me.id },
        select: { passwordHash: true },
      });
      // Changed in between by another request: the checked password is stale.
      if (current.passwordHash !== user.passwordHash) return false;
      await tx.user.update({ where: { id: me.id }, data: { passwordHash } });
      await tx.authSession.deleteMany({
        where: { userId: me.id, id: { not: sessionId } },
      });
      await tx.loginChallenge.deleteMany({ where: { userId: me.id } });
      return true;
    });
    if (!changed) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      return;
    }
    res.status(204).end();
  });

  router.post(
    '/photo',
    limiter(options.uploadLimit ?? 20),
    photoField(),
    async (req, res) => {
      if (!req.file) throw new ContactError(400, 'PHOTO_REQUIRED');
      const id = principal(res.locals).user.id;
      const stored = await photos().upload(
        await preparePhoto(req.file.buffer),
        id,
      );
      let result;
      try {
        result = await database().$transaction(async (tx) => {
          await lockUser(tx, id);
          const { photoKey: old } = await tx.user.findUniqueOrThrow({
            where: { id },
            select: { photoKey: true },
          });
          const user = await tx.user.update({
            where: { id },
            data: { photoKey: stored.key },
            select: userSelect,
          });
          return { user, old };
        });
      } catch (error) {
        await cleanupPhotos(photos, [stored.key]);
        throw error;
      }
      await cleanupPhotos(photos, [result.old]);
      res.json({ user: await presentUser(result.user, photos) });
    },
  );
  router.delete('/photo', async (_req, res) => {
    const id = principal(res.locals).user.id;
    const result = await database().$transaction(async (tx) => {
      await lockUser(tx, id);
      const { photoKey: old } = await tx.user.findUniqueOrThrow({
        where: { id },
        select: { photoKey: true },
      });
      const user = await tx.user.update({
        where: { id },
        data: { photoKey: null },
        select: userSelect,
      });
      return { user, old };
    });
    await cleanupPhotos(photos, [result.old]);
    res.json({ user: await presentUser(result.user, photos) });
  });

  // Ends every session, this one included.
  router.post('/logout-all', async (_req, res) => {
    const id = principal(res.locals).user.id;
    await database().$transaction([
      database().authSession.deleteMany({ where: { userId: id } }),
      database().loginChallenge.deleteMany({ where: { userId: id } }),
    ]);
    res.clearCookie(cookieName, cookieOptions(config()));
    res.status(204).end();
  });

  // Needs the password, and a current code when 2FA is on. Contacts, sessions
  // and ignored duplicates go with the user; photos are removed afterwards.
  router.post('/delete', limiter(10), async (req, res) => {
    const body = secondFactorBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    const id = principal(res.locals).user.id;
    const user = await database().user.findUniqueOrThrow({ where: { id } });
    if (!(await verifyPassword(body.data.password, user.passwordHash))) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      return;
    }
    const input = secondFactor(body.data);
    if (user.twoFactorEnabled && !input) {
      res.status(400).json({ error: 'TWO_FACTOR_REQUIRED' });
      return;
    }
    const result = await database().$transaction(async (tx) => {
      await lockUser(tx, id);
      const current = await tx.user.findUniqueOrThrow({ where: { id } });
      if (current.passwordHash !== user.passwordHash)
        return { error: 'INVALID_CREDENTIALS' as const };
      if (
        current.twoFactorEnabled &&
        !(
          current.twoFactorSecretEncrypted &&
          input &&
          (await checkSecondFactor(
            {
              ...current,
              twoFactorSecretEncrypted: current.twoFactorSecretEncrypted,
            },
            input,
            config(),
            new Date(),
          ))
        )
      )
        return { error: 'INVALID_TWO_FACTOR_CODE' as const };
      const contacts = await tx.contact.findMany({
        where: { userId: id, photoKey: { not: null } },
        select: { photoKey: true },
      });
      await tx.user.delete({ where: { id } });
      return { keys: [current.photoKey, ...contacts.map((c) => c.photoKey)] };
    });
    if ('error' in result) {
      res.status(401).json({ error: result.error });
      return;
    }
    res.clearCookie(cookieName, cookieOptions(config()));
    res.status(204).end();
    await cleanupPhotos(photos, result.keys);
  });

  return router;
}
