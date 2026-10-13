import { parseCookie } from 'cookie';
import { localeCookie } from '../../i18n/config';
import { Router, json, rateLimit, type Handler, type Req } from '../http';
import { getDatabase } from '../database/client';
import { getAuthConfig } from '../auth/config';
import { requireAuth, type AuthPrincipal } from '../auth/middleware';
import type { AuthOptions } from '../auth/routes';
import type { Prisma } from '../generated/prisma/client';
import {
  createBody,
  patchBody,
  idSchema,
  listQuery,
  duplicateQuery,
  matchQuery,
  mergeBody,
  ignoreBody,
  contactSelect,
  tagBody,
  tagLimit,
  tagPatch,
} from './validation';
import {
  contactsWithPhone,
  listContacts,
  listTrash,
  purgeTrash,
  duplicateContacts,
  ignoreDuplicates,
  listTags,
  seedTags,
  setContactTags,
  tagKey,
} from './queries';
import {
  cloudinaryPhotos,
  presentContact,
  cleanupPhotos,
  photoField,
  preparePhoto,
  ContactError,
  type PhotoStore,
} from './photos';

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
  const router = new Router();
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
    // Contacts in the trash are out of reach until restored.
    const contact = await tx.contact.findFirst({
      where: { id, userId, deletedAt: null },
    });
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
  const localeOf = (req: Req) =>
    parseCookie(req.headers.cookie ?? '')[localeCookie] === 'en' ? 'en' : 'fa';
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
  router.use(json({ limit: 16 * 1024 }));
  const validId: Handler = (req, res, next) => {
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
    const locale = localeOf(req);
    // Contacts a week in the trash go for good whenever the book is opened.
    await cleanupPhotos(photos, await purgeTrash(db(), userId));
    const [result, trashCount] = await Promise.all([
      listContacts(db(), userId, query.data, locale),
      db().contact.count({ where: { userId, deletedAt: { not: null } } }),
    ]);
    res.json({
      trashCount,
      ...result,
      contacts: await Promise.all(
        result.contacts.map((c) => presentContact(c, userId, photos)),
      ),
    });
  });
  // Tags: the user's own labels. The default ones appear on first use.
  const seeded = async (req: Req, userId: string) => {
    const user = await db().user.findUnique({
      where: { id: userId },
      select: { tagsSeeded: true },
    });
    if (!user?.tagsSeeded)
      await mutate(userId, (tx) => seedTags(tx, userId, localeOf(req)));
  };
  // A name another of the user's tags already has.
  const nameTaken = async (
    tx: Prisma.TransactionClient,
    userId: string,
    name: string,
    except?: string,
  ) =>
    (
      await tx.tag.findMany({
        where: { userId, ...(except ? { id: { not: except } } : {}) },
        select: { name: true },
      })
    ).some((t) => tagKey(t.name) === tagKey(name));
  router.get('/tags', async (req, res) => {
    const userId = owner(res.locals);
    await seeded(req, userId);
    res.json({ tags: await listTags(db(), userId) });
  });
  router.post('/tags', async (req, res) => {
    const body = tagBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    const userId = owner(res.locals);
    await seeded(req, userId);
    const tag = await mutate(userId, async (tx) => {
      if ((await tx.tag.count({ where: { userId } })) >= tagLimit)
        throw new ContactError(409, 'TAG_LIMIT');
      if (await nameTaken(tx, userId, body.data.name))
        throw new ContactError(409, 'TAG_EXISTS');
      return tx.tag.create({
        data: { ...body.data, userId },
        select: { id: true, name: true, color: true },
      });
    });
    res.status(201).json({ tag: { ...tag, count: 0 } });
  });
  router.patch('/tags/:id', validId, async (req, res) => {
    const body = tagPatch.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    const userId = owner(res.locals),
      id = req.params.id as string;
    const tags = await mutate(userId, async (tx) => {
      if (!(await tx.tag.findFirst({ where: { id, userId } })))
        throw new ContactError(404, 'TAG_NOT_FOUND');
      if (body.data.name && (await nameTaken(tx, userId, body.data.name, id)))
        throw new ContactError(409, 'TAG_EXISTS');
      await tx.tag.update({ where: { id }, data: body.data });
      return listTags(tx, userId);
    });
    res.json({ tag: tags.find((t) => t.id === id) });
  });
  // The tag comes off every contact that carried it.
  router.delete('/tags/:id', validId, async (req, res) => {
    const userId = owner(res.locals);
    const { count } = await mutate(userId, (tx) =>
      tx.tag.deleteMany({ where: { id: req.params.id as string, userId } }),
    );
    if (!count) throw new ContactError(404, 'TAG_NOT_FOUND');
    res.status(204).end();
  });

  // The trash: what is in it (a week's contacts at most), and deleting one
  // or all of it for good, photos included.
  router.get('/trash', async (_req, res) => {
    const userId = owner(res.locals);
    await cleanupPhotos(photos, await purgeTrash(db(), userId));
    const contacts = await listTrash(db(), userId);
    res.json({
      contacts: await Promise.all(
        contacts.map(async ({ deletedAt, purgeAt, ...contact }) => ({
          ...(await presentContact(contact, userId, photos)),
          deletedAt,
          purgeAt,
        })),
      ),
    });
  });
  router.delete('/trash', async (_req, res) => {
    const userId = owner(res.locals);
    const keys = await mutate(userId, async (tx) => {
      const trashed = await tx.contact.findMany({
        where: { userId, deletedAt: { not: null } },
        select: { photoKey: true },
      });
      await tx.contact.deleteMany({
        where: { userId, deletedAt: { not: null } },
      });
      return trashed.map((c) => c.photoKey);
    });
    await cleanupPhotos(photos, keys);
    res.status(204).end();
  });
  router.delete('/trash/:id', validId, async (req, res) => {
    const userId = owner(res.locals),
      id = req.params.id as string;
    const key = await mutate(userId, async (tx) => {
      const trashed = await tx.contact.findFirst({
        where: { id, userId, deletedAt: { not: null } },
        select: { photoKey: true },
      });
      if (!trashed) throw new ContactError(404, 'CONTACT_NOT_FOUND');
      await tx.contact.delete({ where: { id, userId } });
      return trashed.photoKey;
    });
    await cleanupPhotos(photos, [key]);
    res.status(204).end();
  });

  // Before saving: is this number already in the book? (At most three.)
  router.get('/match', async (req, res) => {
    const query = matchQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: 'INVALID_QUERY' });
      return;
    }
    const { phone, except } = query.data;
    res.json({
      contacts: await contactsWithPhone(db(), owner(res.locals), phone, except),
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
      ignoreDuplicates(tx, userId, body.data),
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
        where: { userId, deletedAt: null, id: { in: sourceIds } },
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
      // The merged contact keeps every tag any of them had.
      const tagIds = await tx.contactTag.findMany({
        where: { contactId: { in: sourceIds } },
        select: { tagId: true },
      });
      if (tagIds.length)
        await tx.contactTag.createMany({
          data: tagIds.map(({ tagId }) => ({ contactId: targetId, tagId })),
          skipDuplicates: true,
        });
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
    const { id, tagIds, ...fields } = body.data;
    const result = await mutate(userId, async (tx) => {
      // The same ID again is the same save repeated: answer with what it
      // made. Another account's ID is never touched.
      const existing = id
        ? await tx.contact.findUnique({
            where: { id },
            select: { ...contactSelect, userId: true },
          })
        : null;
      if (existing) {
        const { userId: holder, ...contact } = existing;
        if (holder !== userId) throw new ContactError(409, 'CONTACT_ID_TAKEN');
        return { contact, created: false };
      }
      let contact = await tx.contact.create({
        data: { ...fields, ...bodyData(fields), id, userId },
        select: contactSelect,
      });
      if (tagIds?.length) {
        await setContactTags(tx, userId, contact.id, tagIds);
        contact = await tx.contact.findUniqueOrThrow({
          where: { id: contact.id },
          select: contactSelect,
        });
      }
      return { contact, created: true };
    });
    res
      .status(result.created ? 201 : 200)
      .json({ contact: await presentContact(result.contact, userId, photos) });
  });
  router.get('/:id', validId, async (req, res) => {
    const contact = await db().contact.findFirst({
      where: {
        id: req.params.id as string,
        userId: owner(res.locals),
        deletedAt: null,
      },
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
    const { tagIds, ...fields } = body.data;
    const contact = await mutate(userId, async (tx) => {
      await owned(tx, id, userId);
      if (tagIds) await setContactTags(tx, userId, id, tagIds);
      return tx.contact.update({
        where: { id, userId },
        data: {
          ...fields,
          ...bodyData(fields),
          // A change of tags alone is a change of the contact too.
          ...(tagIds ? { updatedAt: new Date() } : {}),
        },
        select: contactSelect,
      });
    });
    res.json({
      contact: await presentContact(contact, owner(res.locals), photos),
    });
  });
  // Deleting moves the contact to the trash (photo kept, so it can come
  // back whole); the trash routes below restore it or delete it for good.
  router.delete('/:id', validId, async (req, res) => {
    const userId = owner(res.locals),
      id = req.params.id as string;
    await mutate(userId, async (tx) => {
      await owned(tx, id, userId);
      await tx.contact.update({
        where: { id, userId },
        data: { deletedAt: new Date() },
      });
    });
    res.status(204).end();
  });
  router.post('/:id/restore', validId, async (req, res) => {
    const userId = owner(res.locals),
      id = req.params.id as string;
    const contact = await mutate(userId, async (tx) => {
      const trashed = await tx.contact.findFirst({
        where: { id, userId, deletedAt: { not: null } },
      });
      if (!trashed) throw new ContactError(404, 'CONTACT_NOT_FOUND');
      return tx.contact.update({
        where: { id, userId },
        data: { deletedAt: null },
        select: contactSelect,
      });
    });
    res.json({ contact: await presentContact(contact, userId, photos) });
  });
  router.post(
    '/:id/photo',
    validId,
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: options.uploadLimit ?? 20,
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
    photoField(),
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
