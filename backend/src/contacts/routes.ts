import { Router, json, type RequestHandler } from 'express';
import cors from 'cors';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { getDatabase } from '../database/client.js';
import { getAuthConfig } from '../auth/config.js';
import { requireAuth, type AuthPrincipal } from '../auth/middleware.js';
import type { AuthOptions } from '../auth/routes.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  createBody,
  patchBody,
  idSchema,
  listQuery,
  duplicateQuery,
  mergeBody,
  ignoreBody,
  contactSelect,
} from './validation.js';
import {
  listContacts,
  duplicateContacts,
  ignoreDuplicates,
} from './queries.js';
import {
  cloudinaryPhotos,
  presentContact,
  cleanupPhotos,
  preparePhoto,
  ContactError,
  type PhotoStore,
} from './photos.js';

export interface ContactOptions {
  photos?: () => PhotoStore;
  uploadLimit?: number;
}

export function contactsRouter(
  auth: AuthOptions = {},
  options: ContactOptions = {},
) {
  const db = auth.database ?? getDatabase;
  const config = auth.config ?? getAuthConfig;
  const photos = options.photos ?? cloudinaryPhotos;
  const router = Router();
  const owner = (locals: Record<string, unknown>) =>
    (locals.auth as AuthPrincipal).user.id;
  const mutate = <T>(
    userId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ) =>
    db().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      return work(tx);
    });
  const owned = async (
    tx: Prisma.TransactionClient,
    id: string,
    userId: string,
  ) => {
    const contact = await tx.contact.findFirst({ where: { id, userId } });
    if (!contact) throw new ContactError(404, 'CONTACT_NOT_FOUND');
    return contact;
  };
  const bodyData = (data: { birthday?: string | null }) => ({
    ...data,
    ...(data.birthday !== undefined
      ? {
          birthday:
            data.birthday === null
              ? null
              : new Date(`${data.birthday}T00:00:00.000Z`),
        }
      : {}),
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
    if (
      req.method === 'POST' &&
      req.is('multipart/form-data') &&
      origin !== config().origin
    ) {
      res.status(403).json({ error: 'ORIGIN_REQUIRED' });
      return;
    }
    next();
  });
  router.use(
    cors((req, callback) =>
      callback(null, {
        origin: req.headers.origin ? config().origin : false,
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'DELETE'],
        allowedHeaders: ['Content-Type'],
      }),
    ),
  );
  router.use(requireAuth(db, config));
  router.use((req, res, next) => {
    if (
      ['POST', 'PATCH'].includes(req.method) &&
      !req.is('application/json') &&
      !(
        req.method === 'POST' &&
        /^\/[0-9a-f-]+\/photo\/?$/i.test(req.path) &&
        req.is('multipart/form-data')
      )
    ) {
      res.status(415).json({ error: 'JSON_REQUIRED' });
      return;
    }
    next();
  });
  router.use(json({ limit: '16kb' }));
  const validId: RequestHandler = (req, res, next) => {
    if (!idSchema.safeParse(req.params.id).success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }
    next();
  };
  router.get('/', async (req, res) => {
    const query = listQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: 'INVALID_QUERY' });
      return;
    }
    const userId = owner(res.locals);
    const result = await listContacts(db(), userId, query.data);
    res.json({
      ...result,
      contacts: await Promise.all(
        result.contacts.map((c) => presentContact(c, userId, photos)),
      ),
    });
  });
  router.get('/duplicates', async (req, res) => {
    const query = duplicateQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: 'INVALID_QUERY' });
      return;
    }
    const userId = owner(res.locals);
    const result = await duplicateContacts(db(), userId, query.data);
    res.json({
      ...result,
      groups: await Promise.all(
        result.groups.map(async (g) => ({
          ...g,
          contacts: await Promise.all(
            g.contacts.map((c) => presentContact(c, userId, photos)),
          ),
        })),
      ),
    });
  });
  router.post('/duplicates/ignore', async (req, res) => {
    const body = ignoreBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    const userId = owner(res.locals);
    const result = await mutate(userId, (tx) =>
      ignoreDuplicates(tx, userId, body.data.contactIds),
    );
    if (result === 'missing') throw new ContactError(404, 'CONTACT_NOT_FOUND');
    if (result === 'mismatch') throw new ContactError(409, 'NOT_DUPLICATES');
    res.status(204).end();
  });
  router.post('/merge', async (req, res) => {
    const parsed = mergeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    const { targetId, sourceIds, overrides = {} } = parsed.data;
    const userId = owner(res.locals);
    const result = await mutate(userId, async (tx) => {
      const target = await owned(tx, targetId, userId);
      const sources = await tx.contact.findMany({
        where: { userId, id: { in: sourceIds } },
        orderBy: { id: 'asc' },
      });
      if (sources.length !== sourceIds.length)
        throw new ContactError(404, 'CONTACT_NOT_FOUND');
      const photo = [target, ...sources].find((c) => c.photoKey || c.photoUrl);
      const reminder =
        overrides.reminder !== undefined
          ? overrides.reminder
          : [
              ...new Set(
                [target, ...sources].map((c) => c.reminder).filter(Boolean),
              ),
            ].join('\n') || null;
      if (reminder && reminder.length > 2000)
        throw new ContactError(409, 'MERGE_REMINDER_TOO_LONG');
      const contact = await tx.contact.update({
        where: { id: targetId, userId },
        data: {
          birthday:
            target.birthday ??
            sources.find((c) => c.birthday)?.birthday ??
            null,
          ...bodyData(overrides),
          reminder,
          photoUrl: photo?.photoUrl ?? null,
          photoKey: photo?.photoKey ?? null,
        },
        select: contactSelect,
      });
      await tx.contact.deleteMany({ where: { userId, id: { in: sourceIds } } });
      return {
        contact,
        removed: sources
          .map((c) => c.photoKey)
          .filter((id) => id !== photo?.photoKey),
      };
    });
    await cleanupPhotos(photos, result.removed);
    res.json({
      contact: await presentContact(result.contact, userId, photos),
      mergedCount: sourceIds.length + 1,
    });
  });
  router.post('/', async (req, res) => {
    const body = createBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    const userId = owner(res.locals);
    const contact = await mutate(userId, (tx) =>
      tx.contact.create({
        data: { ...body.data, ...bodyData(body.data), userId },
        select: contactSelect,
      }),
    );
    res
      .status(201)
      .json({ contact: await presentContact(contact, userId, photos) });
  });
  router.get('/:id', validId, async (req, res) => {
    const contact = await db().contact.findFirst({
      where: { id: req.params.id as string, userId: owner(res.locals) },
      select: contactSelect,
    });
    if (!contact) throw new ContactError(404, 'CONTACT_NOT_FOUND');
    res.json({
      contact: await presentContact(contact, owner(res.locals), photos),
    });
  });
  router.patch('/:id', validId, async (req, res) => {
    const body = patchBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    const userId = owner(res.locals),
      id = req.params.id as string;
    const contact = await mutate(userId, async (tx) => {
      await owned(tx, id, userId);
      return tx.contact.update({
        where: { id, userId },
        data: { ...body.data, ...bodyData(body.data) },
        select: contactSelect,
      });
    });
    res.json({
      contact: await presentContact(contact, owner(res.locals), photos),
    });
  });
  router.delete('/:id', validId, async (req, res) => {
    const userId = owner(res.locals),
      id = req.params.id as string;
    const contact = await mutate(userId, async (tx) => {
      const contact = await owned(tx, id, userId);
      await tx.contact.delete({ where: { id, userId } });
      return contact;
    });
    await cleanupPhotos(photos, [contact.photoKey]);
    res.status(204).end();
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
    fileFilter: (_req, file, callback) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
        callback(new ContactError(415, 'INVALID_IMAGE'));
      else callback(null, true);
    },
  });
  router.post(
    '/:id/photo',
    validId,
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: options.uploadLimit ?? 20,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'TOO_MANY_REQUESTS' },
    }),
    async (req, res, next) => {
      await owned(db(), req.params.id as string, owner(res.locals));
      if (!req.is('multipart/form-data')) {
        res.status(415).json({ error: 'MULTIPART_REQUIRED' });
        return;
      }
      next();
    },
    (req, res, next) => {
      upload.single('photo')(req, res, (error: unknown) => {
        if (
          !error ||
          error instanceof multer.MulterError ||
          error instanceof ContactError
        )
          next(error);
        else next(new ContactError(400, 'INVALID_MULTIPART'));
      });
    },
    async (req, res) => {
      if (!req.file) throw new ContactError(400, 'PHOTO_REQUIRED');
      const userId = owner(res.locals),
        id = req.params.id as string;
      const buffer = await preparePhoto(req.file.buffer);
      const stored = await photos().upload(buffer, userId);
      let result;
      try {
        result = await mutate(userId, async (tx) => {
          const old = await owned(tx, id, userId);
          const contact = await tx.contact.update({
            where: { id, userId },
            data: { photoUrl: null, photoKey: stored.key },
            select: contactSelect,
          });
          return { contact, old: old.photoKey };
        });
      } catch (error) {
        await cleanupPhotos(photos, [stored.key]);
        throw error;
      }
      await cleanupPhotos(photos, [result.old]);
      res.json({
        contact: await presentContact(result.contact, userId, photos),
      });
    },
  );
  router.delete('/:id/photo', validId, async (req, res) => {
    const userId = owner(res.locals),
      id = req.params.id as string;
    const result = await mutate(userId, async (tx) => {
      const old = await owned(tx, id, userId);
      const contact = await tx.contact.update({
        where: { id, userId },
        data: { photoUrl: null, photoKey: null },
        select: contactSelect,
      });
      return { contact, old: old.photoKey };
    });
    await cleanupPhotos(photos, [result.old]);
    res.json({ contact: await presentContact(result.contact, userId, photos) });
  });
  return router;
}
