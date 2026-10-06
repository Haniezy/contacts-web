import { after, before, beforeEach, test } from 'node:test';
import { expect } from 'expect';
import { ModuleMocker } from 'jest-mock';

const jest = new ModuleMocker(globalThis);
import { randomBytes, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../../../src/server/app';
import { createDatabaseClient } from '../../../src/server/database/client';
import { createToken } from '../../../src/server/auth/tokens';
import {
  ContactError,
  preparePhoto,
} from '../../../src/server/contacts/photos';

if (!process.env.DATABASE_TEST_URL)
  throw new Error(
    'DATABASE_TEST_URL must point to a migrated development/test PostgreSQL database',
  );
const db = createDatabaseClient(process.env.DATABASE_TEST_URL);
const config = {
  secret: randomBytes(48),
  origin: 'http://localhost:3000',
  secureCookie: false,
};
const users = [],
  cookies = [];
const upload = jest.fn(),
  remove = jest.fn(),
  url = jest.fn();
const app = createApp(
  async () => {},
  { database: () => db, config: () => config },
  { photos: () => ({ upload, remove, url }), uploadLimit: 100 },
);
let png;
const api = (method, path = '', user = 0) =>
  request(app.listener)
    [method](`/api/contacts${path}`)
    .set('Cookie', cookies[user]);
const add = async (data = {}, user = 0) =>
  (
    await api('post', '', user)
      .send({ name: 'علی', phone: '09123456789', ...data })
      .expect(201)
  ).body.contact;
const photo = (id, user = 0, image = png) =>
  api('post', `/${id}/photo`, user)
    .set('Origin', config.origin)
    .attach('photo', image, {
      filename: 'photo.png',
      contentType: 'image/png',
    });

before(async () => {
  png = await sharp({
    create: { width: 16, height: 16, channels: 3, background: '#123456' },
  })
    .png()
    .toBuffer();
  for (let i = 0; i < 2; i++) {
    const user = await db.user.create({
      data: {
        email: `contacts-jest-${randomUUID()}@example.test`,
        passwordHash: 'test-fixture-no-login',
      },
    });
    users.push(user);
    const expiresAt = new Date(Date.now() + 3600000);
    const session = await db.authSession.create({
      data: { userId: user.id, expiresAt },
    });
    cookies.push(
      `contacts_session=${await createToken(user.id, session.id, config, expiresAt)}`,
    );
  }
});
beforeEach(async () => {
  await db.contact.deleteMany({
    where: { userId: { in: users.map((u) => u.id) } },
  });
  upload.mockReset().mockImplementation(async (_image, userId) => {
    const key = `contacts/${userId}/${randomUUID()}`;
    return {
      key,
    };
  });
  url
    .mockReset()
    .mockImplementation(
      async (key) => `https://api.cloudinary.com/${key}?signature=test`,
    );
  remove.mockReset().mockResolvedValue(undefined);
});
after(async () => {
  try {
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  } finally {
    await db.$disconnect();
  }
});

test('every route requires a valid full session', async () => {
  const id = randomUUID();
  for (const [method, path] of [
    ['get', ''],
    ['post', ''],
    ['get', '/duplicates'],
    ['post', '/duplicates/ignore'],
    ['post', '/merge'],
    ['get', `/${id}`],
    ['patch', `/${id}`],
    ['delete', `/${id}`],
    ['post', `/${id}/photo`],
    ['delete', `/${id}/photo`],
  ]) {
    await request(app.listener)
      [method](`/api/contacts${path}`)
      .send({})
      .expect(401);
  }
  await request(app.listener)
    .get('/api/contacts')
    .set('Cookie', 'contacts_session=forged')
    .expect(401);
  await db.user.update({
    where: { id: users[0].id },
    data: { twoFactorEnabled: true },
  });
  try {
    await api('get').expect(401);
  } finally {
    await db.user.update({
      where: { id: users[0].id },
      data: { twoFactorEnabled: false },
    });
  }
});

test('create/read/update/delete with optional fields and Persian digits', async () => {
  const c = await add({
    name: '  سارا  ',
    phone: '+۹۸ (۹۱۲) ۳۴۵-۶۷۸۹',
    birthday: '2000-02-29',
    reminder: '  تولد  ',
  });
  expect(c).toMatchObject({
    name: 'سارا',
    phone: '+989123456789',
    birthday: '2000-02-29T00:00:00.000Z',
    reminder: 'تولد',
    photoUrl: null,
  });
  expect(c).not.toHaveProperty('userId');
  expect(c).not.toHaveProperty('photoKey');
  expect((await api('get', `/${c.id}`).expect(200)).body.contact).toEqual(c);
  const updated = (
    await api('patch', `/${c.id}`)
      .send({ name: 'Sara', birthday: null, reminder: null })
      .expect(200)
  ).body.contact;
  expect(updated).toMatchObject({
    name: 'Sara',
    birthday: null,
    reminder: null,
    phone: c.phone,
  });
  expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(
    Date.parse(c.updatedAt),
  );
  await api('delete', `/${c.id}`).expect(204);
  await api('get', `/${c.id}`).expect(404);
});

test('A cannot read, update, delete, upload or clear a photo belonging to B', async () => {
  const b = await add({ name: 'Private B' }, 1);
  await api('get', `/${b.id}`).expect(404);
  await api('patch', `/${b.id}`).send({ name: 'stolen' }).expect(404);
  await api('delete', `/${b.id}`).expect(404);
  await photo(b.id).expect(404);
  await api('delete', `/${b.id}/photo`).expect(404);
  expect(upload).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  expect((await api('get', `/${b.id}`, 1)).body.contact.name).toBe('Private B');
  expect((await api('get').expect(200)).body.pagination.total).toBe(0);
  expect((await api('get', '?q=Private').expect(200)).body.contacts).toEqual(
    [],
  );
});

test('mass assignment cannot transfer ownership, IDs or arbitrary photo URLs', async () => {
  for (const extra of [
    { userId: users[1].id },
    { id: randomUUID() },
    { photoUrl: 'https://example.test/a.png' },
    { photoKey: 'other/asset' },
  ])
    await api('post')
      .send({ name: 'Al', phone: '1234567', ...extra })
      .expect(400);
  const c = await add();
  await api('patch', `/${c.id}`).send({ userId: users[1].id }).expect(400);
  expect(await db.contact.count({ where: { userId: users[1].id } })).toBe(0);
});

test('validates names, phone numbers, real dates, optional fields and patch bodies', async () => {
  for (const data of [
    { name: '' },
    { name: 'A' },
    { name: ' A ' },
    { name: 'x'.repeat(29) },
    { name: 'a\u0000b' },
    { phone: 'abc' },
    { phone: '++123' },
    { phone: '12' },
    { phone: '1'.repeat(16) },
    { birthday: '2025-02-29' },
    { birthday: '2000-13-01' },
    { reminder: 'x'.repeat(2001) },
  ])
    await api('post')
      .send({ name: 'Al', phone: '1234567', ...data })
      .expect(400);
  const c = await add();
  await api('patch', `/${c.id}`).send({}).expect(400);
  await api('get', '/bad-id').expect(400);
  await api('get', `/${randomUUID()}`).expect(404);
  await api('patch', `/${randomUUID()}`).send({ name: 'Al' }).expect(404);
});

test('search matches names, Arabic/Persian variants and formatted digits without leaking B', async () => {
  await add({ name: 'علی کریمی', phone: '۰۹۱۲ ۳۴۵ ۶۷۸۹' });
  await add({ name: 'Alice', phone: '+15551234567' });
  await add({ name: 'Alice Secret', phone: '+15551234567' }, 1);
  for (const q of ['علي', 'كريمي', '۹۱۲-۳۴۵', '٩١٢٣٤٥'])
    expect(
      (await api('get', `?q=${encodeURIComponent(q)}`).expect(200)).body
        .pagination.total,
    ).toBe(1);
  expect(
    (await api('get', '?q=ALICE').expect(200)).body.contacts.map((c) => c.name),
  ).toEqual(['Alice']);
  for (const q of ["' OR 1=1 --", '%', '_'])
    expect(
      (await api('get', `?q=${encodeURIComponent(q)}`).expect(200)).body
        .contacts,
    ).toEqual([]);
});

test('alphabetical order, stable tie-breaks, bounded pages and accurate totals', async () => {
  for (const name of ['Charlie', 'Alice', 'Bob', 'Alice']) await add({ name });
  const first = (await api('get', '?pageSize=2').expect(200)).body;
  const second = (await api('get', '?pageSize=2&page=2').expect(200)).body;
  expect(first.contacts.map((c) => c.name)).toEqual(['Alice', 'Alice']);
  expect(first.contacts.map((c) => c.id)).toEqual(
    first.contacts.map((c) => c.id).sort(),
  );
  expect(second.contacts.map((c) => c.name)).toEqual(['Bob', 'Charlie']);
  expect(first.pagination).toEqual({
    page: 1,
    pageSize: 2,
    total: 4,
    totalPages: 2,
  });
  expect((await api('get', '?page=3&pageSize=2')).body.contacts).toEqual([]);
  for (const q of [
    'page=0',
    'page=-1',
    'page=1.2',
    'pageSize=101',
    'pageSize=0',
    'q=a&q=b',
    'sort=phone',
    'page=10001',
  ])
    await api('get', `?${q}`).expect(400);
});

test('Persian letters sort alphabetically with ICU', async () => {
  for (const name of ['چا', 'پا', 'با', 'الف', 'تا']) await add({ name });
  expect((await api('get')).body.contacts.map((c) => c.name)).toEqual([
    'الف',
    'با',
    'پا',
    'تا',
    'چا',
  ]);
});

test('duplicate groups normalize phones and names, and remain owner-scoped', async () => {
  await add({ name: 'علی کریمی', phone: '09123456789' });
  await db.contact.create({
    data: { userId: users[0].id, name: 'علي   كريمي', phone: '۰۹۱۲-۳۴۵-۶۷۸۹' },
  });
  await add({ name: 'علی کریمی', phone: '09123456789' }, 1);
  await add({ name: 'علی کریمی', phone: '09123456789' }, 1);
  for (const by of ['phone', 'name']) {
    const result = (await api('get', `/duplicates?by=${by}`).expect(200)).body;
    expect(result.pagination.total).toBe(1);
    expect(result.groups[0].count).toBe(2);
    expect(result.groups[0].contacts).toHaveLength(2);
  }
  await api('get', '/duplicates?by=email').expect(400);
});

test('Iranian numbers with or without a country code are one phone group', async () => {
  for (const phone of [
    '+98 912 345 6789',
    '0098 912 345 6789',
    '۰۹۱۲ ۳۴۵ ۶۷۸۹',
    '912 345 6789',
    '+98 21 1234 5678',
    '021 1234 5678',
    '1234567',
    '01234567',
  ])
    await add({ name: `Contact ${phone}`, phone });
  const body = (await api('get', '/duplicates?by=phone').expect(200)).body;
  expect(body.groups.map((g) => [g.value, g.count]).sort()).toEqual([
    ['02112345678', 2],
    ['09123456789', 4],
  ]);
  // Search still matches the digits as typed.
  const found = (await api('get', '?q=%2B98912').expect(200)).body;
  expect(found.pagination.total).toBe(2);
});

test('an ignored phone group stays hidden until a new member joins it', async () => {
  const a = await add({ name: 'One', phone: '09120000001' });
  const b = await add({ name: 'Two', phone: '+989120000001' });
  const c = await add({ name: 'One', phone: '09350000000' });
  const other = await add({ name: 'Other', phone: '09120000001' }, 1);
  const groups = async (by = 'phone') =>
    (await api('get', `/duplicates?by=${by}`).expect(200)).body.groups;
  expect(await groups()).toHaveLength(1);

  await api('post', '/duplicates/ignore')
    .send({ contactIds: [a.id] })
    .expect(400);
  await api('post', '/duplicates/ignore')
    .send({ contactIds: [a.id, a.id] })
    .expect(400);
  await api('post', '/duplicates/ignore')
    .send({ contactIds: [a.id, other.id] })
    .expect(404);
  await api('post', '/duplicates/ignore')
    .send({ contactIds: [a.id, c.id] })
    .expect(409);
  await api('post', '/duplicates/ignore')
    .send({ contactIds: [a.id, b.id] })
    .expect(204);
  expect(await groups()).toHaveLength(0);
  // Name groups and other users are unaffected.
  expect(await groups('name')).toHaveLength(1);
  await add({ name: 'Another', phone: '09120000001' }, 1);
  expect(
    (await api('get', '/duplicates?by=phone', 1).expect(200)).body.groups,
  ).toHaveLength(1);

  // Deleting a member keeps the rest hidden; a new member shows the group.
  const d = await add({ name: 'Three', phone: '9120000001' });
  expect((await groups())[0].count).toBe(3);
  await api('delete', `/${d.id}`).expect(204);
  expect(await groups()).toHaveLength(0);
  await add({ name: 'Four', phone: '0098 912 000 0001' });
  expect(await groups()).toHaveLength(1);
});

test('the combined list shows phone groups, then name groups, each group once', async () => {
  await add({ name: 'سارا احمدی', phone: '09120000002' });
  await add({ name: 'سارا  احمدي', phone: '09360000002' });
  await add({ name: 'Xi', phone: '09120000003' });
  await add({ name: 'Yu', phone: '+989120000003' });
  // Same name and same number: one group, listed as a phone group.
  await add({ name: 'Same', phone: '09120000004' });
  await add({ name: 'Same', phone: '09120000004' });
  await add({ name: 'سارا احمدی', phone: '09120000002' }, 1);
  const all = async () =>
    (await api('get', '/duplicates?by=all').expect(200)).body;
  const body = await all();
  expect(body.pagination.total).toBe(3);
  expect(body.groups.map((g) => [g.by, g.count])).toEqual([
    ['phone', 2],
    ['phone', 2],
    ['name', 2],
  ]);
  const sara = body.groups[2].contacts.map((c) => c.id);

  // A name group is ignored by name; asking for it as a phone group fails.
  await api('post', '/duplicates/ignore')
    .send({ by: 'phone', contactIds: sara })
    .expect(409);
  await api('post', '/duplicates/ignore')
    .send({ by: 'email', contactIds: sara })
    .expect(400);
  await api('post', '/duplicates/ignore')
    .send({ by: 'name', contactIds: sara })
    .expect(204);
  expect((await all()).groups.map((g) => g.by)).toEqual(['phone', 'phone']);
  await add({ name: 'سارا احمدی', phone: '09390000002' });
  expect((await all()).groups.map((g) => [g.by, g.count])).toEqual([
    ['phone', 2],
    ['phone', 2],
    ['name', 3],
  ]);
});

test('duplicate group and member previews are bounded', async () => {
  await db.contact.createMany({
    data: Array.from({ length: 23 }, (_, i) => ({
      userId: users[0].id,
      name: `Group ${i}`,
      phone: '1111111',
    })).concat([
      { userId: users[0].id, name: 'Other1', phone: '2222222' },
      { userId: users[0].id, name: 'Other2', phone: '2222222' },
    ]),
  });
  const body = (await api('get', '/duplicates?pageSize=1')).body;
  expect(body.pagination.total).toBe(2);
  expect(body.groups).toHaveLength(1);
  expect(body.groups[0]).toMatchObject({ count: 23, hasMore: true });
  expect(body.groups[0].contacts).toHaveLength(20);
});

test('merge preserves target, fills birthday, combines reminders and deletes only sources', async () => {
  const a = await add({ name: 'Target', reminder: 'one' }),
    b = await add({ name: 'Source', birthday: '2001-01-01', reminder: 'two' }),
    unrelated = await add({ name: 'Unrelated' });
  const result = (
    await api('post', '/merge')
      .send({ targetId: a.id, sourceIds: [b.id] })
      .expect(200)
  ).body;
  expect(result).toMatchObject({
    mergedCount: 2,
    contact: {
      id: a.id,
      name: 'Target',
      birthday: '2001-01-01T00:00:00.000Z',
      reminder: 'one\ntwo',
    },
  });
  await api('get', `/${b.id}`).expect(404);
  await api('get', `/${unrelated.id}`).expect(200);
});

test('merge rejects foreign target or foreign/missing source atomically', async () => {
  const a = await add(),
    other = await add(),
    b = await add({}, 1);
  for (const body of [
    { targetId: a.id, sourceIds: [other.id, b.id] },
    { targetId: b.id, sourceIds: [a.id] },
    { targetId: a.id, sourceIds: [other.id, randomUUID()] },
  ])
    await api('post', '/merge').send(body).expect(404);
  expect(
    await db.contact.count({ where: { id: { in: [a.id, b.id, other.id] } } }),
  ).toBe(3);
});

test('merge validates repeated IDs and allows explicit field conflict choices', async () => {
  const a = await add({ reminder: 'a'.repeat(1500) }),
    b = await add({ reminder: 'b'.repeat(1500) });
  for (const body of [
    { targetId: a.id, sourceIds: [] },
    { targetId: a.id, sourceIds: [a.id] },
    { targetId: a.id, sourceIds: [b.id, b.id] },
    { targetId: a.id, sourceIds: [b.id], overrides: { userId: users[1].id } },
  ])
    await api('post', '/merge').send(body).expect(400);
  await api('post', '/merge')
    .send({ targetId: a.id, sourceIds: [b.id] })
    .expect(409);
  expect(await db.contact.count({ where: { userId: users[0].id } })).toBe(2);
  const result = await api('post', '/merge')
    .send({
      targetId: a.id,
      sourceIds: [b.id],
      overrides: { name: 'Chosen', phone: '123456', reminder: null },
    })
    .expect(200);
  expect(result.body.contact).toMatchObject({
    name: 'Chosen',
    phone: '123456',
    reminder: null,
  });
});

test('concurrent merge requests cannot consume the same source twice', async () => {
  const a = await add(),
    b = await add(),
    c = await add();
  const results = await Promise.all([
    api('post', '/merge').send({ targetId: a.id, sourceIds: [b.id] }),
    api('post', '/merge').send({ targetId: c.id, sourceIds: [b.id] }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 404]);
  expect(await db.contact.count({ where: { userId: users[0].id } })).toBe(2);
});

test('upload re-encodes real image, strips internal asset ID, replaces and clears photo', async () => {
  const c = await add();
  const first = (await photo(c.id).expect(200)).body.contact;
  expect(first.photoUrl).toMatch(/^https:\/\/api.cloudinary.com\//);
  expect(first).not.toHaveProperty('photoKey');
  const [buffer, userId] = upload.mock.calls[0];
  expect(userId).toBe(users[0].id);
  expect((await sharp(buffer).metadata()).format).toBe('webp');
  const stored = await db.contact.findUnique({ where: { id: c.id } });
  await photo(c.id).expect(200);
  expect(remove).toHaveBeenCalledWith(stored.photoKey);
  expect(
    (await api('delete', `/${c.id}/photo`).expect(200)).body.contact.photoUrl,
  ).toBeNull();
  expect(remove).toHaveBeenCalledTimes(2);
});

test('merge moves source photo to target without deleting the retained asset', async () => {
  const a = await add(),
    b = await add();
  await photo(b.id).expect(200);
  const old = await db.contact.findUnique({ where: { id: b.id } });
  await api('post', '/merge')
    .send({ targetId: a.id, sourceIds: [b.id] })
    .expect(200);
  expect((await db.contact.findUnique({ where: { id: a.id } })).photoKey).toBe(
    old.photoKey,
  );
  expect(remove).not.toHaveBeenCalled();
  await api('delete', `/${a.id}`).expect(204);
  expect(remove).toHaveBeenCalledWith(old.photoKey);
});

test('upload rejects spoofed MIME, SVG, missing image, extra fields and oversized files', async () => {
  const c = await add();
  await photo(c.id, 0, Buffer.from('this is not an image')).expect(415);
  await api('post', `/${c.id}/photo`)
    .set('Origin', config.origin)
    .attach('photo', Buffer.from('<svg/>'), {
      filename: 'x.svg',
      contentType: 'image/svg+xml',
    })
    .expect(415);
  await photo(c.id, 0, Buffer.alloc(4 * 1024 * 1024 + 1)).expect(413);
  await api('post', `/${c.id}/photo`)
    .set('Origin', config.origin)
    .field('extra', 'value')
    .expect(400);
  await api('post', `/${c.id}/photo`).send({}).expect(415);
  expect(upload).not.toHaveBeenCalled();
});

test('decoded image pixel limit is enforced before cloud upload', async () => {
  const large = await sharp({
    create: { width: 5000, height: 5000, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  await expect(preparePhoto(large)).rejects.toMatchObject({
    status: 415,
    code: 'INVALID_IMAGE',
  });
});

test('provider failure leaves old contact intact and database failure cleans newly uploaded asset', async () => {
  const c = await add();
  upload.mockRejectedValueOnce(new ContactError(502, 'PHOTO_UPLOAD_FAILED'));
  await photo(c.id).expect(502);
  expect((await api('get', `/${c.id}`)).body.contact.photoUrl).toBeNull();
  const key = `contacts/${users[0].id}/test-orphan.webp`;
  upload.mockImplementationOnce(async () => {
    await db.contact.delete({ where: { id: c.id } });
    return { url: 'https://example.test/photo.webp', key };
  });
  await photo(c.id).expect(404);
  expect(remove).toHaveBeenCalledWith(key);
});

test('missing provider credentials returns explicit 503', async () => {
  const c = await add();
  const unconfigured = createApp(
    async () => {},
    { database: () => db, config: () => config },
    {
      photos: () => {
        throw new ContactError(503, 'PHOTO_STORAGE_NOT_CONFIGURED');
      },
    },
  );
  const r = await request(unconfigured.listener)
    .post(`/api/contacts/${c.id}/photo`)
    .set('Cookie', cookies[0])
    .set('Origin', config.origin)
    .attach('photo', png, 'a.png')
    .expect(503);
  expect(r.body.error).toBe('PHOTO_STORAGE_NOT_CONFIGURED');
});

test('blocks cross-origin JSON and multipart CSRF', async () => {
  const c = await add();
  await api('post')
    .set('Origin', 'https://evil.test')
    .send({ name: 'Al', phone: '123456' })
    .expect(403);
  await api('delete', `/${c.id}`)
    .set('Sec-Fetch-Site', 'cross-site')
    .expect(403);
  await api('post', `/${c.id}/photo`).attach('photo', png, 'a.png').expect(403);
  await api('post', `/${c.id}/photo`)
    .set('Origin', 'https://evil.test')
    .attach('photo', png, 'a.png')
    .expect(403);
  await api('post').set('Content-Type', 'text/plain').send('{}').expect(415);
  expect((await api('get')).headers['cache-control']).toBe('no-store');
});

test('malformed JSON and oversized body return 400/413 without mutation', async () => {
  await api('post')
    .set('Content-Type', 'application/json')
    .send('{bad')
    .expect(400);
  await api('post')
    .send({ name: 'x'.repeat(17000) })
    .expect(413);
  expect(await db.contact.count({ where: { userId: users[0].id } })).toBe(0);
});

test('upload rate limit is enforced before storing image', async () => {
  const c = await add();
  const limited = createApp(
    async () => {},
    { database: () => db, config: () => config },
    { photos: () => ({ upload, remove, url }), uploadLimit: 1 },
  );
  const send = () =>
    request(limited.listener)
      .post(`/api/contacts/${c.id}/photo`)
      .set('Cookie', cookies[0])
      .set('Origin', config.origin)
      .attach('photo', png, 'a.png');
  await send().expect(200);
  await send().expect(429);
  expect(upload).toHaveBeenCalledTimes(1);
});

test('malformed multipart and an empty upload return client errors', async () => {
  const c = await add();
  await api('post', `/${c.id}/photo`)
    .set('Origin', config.origin)
    .set('Content-Type', 'multipart/form-data; boundary=test-boundary')
    .send('truncated')
    .expect(400);
  const empty = await api('post', `/${c.id}/photo`)
    .set('Origin', config.origin)
    .set('Content-Type', 'multipart/form-data; boundary=test-boundary')
    .send('--test-boundary--\r\n')
    .expect(400);
  expect(empty.body.error).toBe('PHOTO_REQUIRED');
  expect(upload).not.toHaveBeenCalled();
});

test('concurrent photo replacements retain one asset and clean only superseded assets', async () => {
  const c = await add();
  const results = await Promise.all([photo(c.id), photo(c.id)]);
  expect(results.map((r) => r.status)).toEqual([200, 200]);
  const kept = await db.contact.findUnique({ where: { id: c.id } });
  const uploaded = await Promise.all(upload.mock.results.map((r) => r.value));
  expect(uploaded.map((v) => v.key)).toContain(kept.photoKey);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith(
    uploaded.find((v) => v.key !== kept.photoKey).key,
  );
  expect(remove).not.toHaveBeenCalledWith(kept.photoKey);
});

test('case-insensitive UUID aliases cannot merge a contact into itself', async () => {
  const c = await add();
  await api('post', '/merge')
    .send({ targetId: c.id, sourceIds: [c.id.toUpperCase()] })
    .expect(400);
  await api('get', `/${c.id}`).expect(200);
  await api('get', '?q=%00').expect(400);
});

test('private photo URLs are generated only for the owner in detail, list and duplicates', async () => {
  const c = await add();
  await add();
  await photo(c.id).expect(200);
  const stored = await db.contact.findUnique({ where: { id: c.id } });
  expect(stored.photoUrl).toBeNull();
  expect(stored.photoKey).toMatch(/^contacts\//);
  url.mockClear();
  await api('get', `/${c.id}`, 1).expect(404);
  await api('get', '', 1).expect(200);
  await api('get', '/duplicates', 1).expect(200);
  expect(url).not.toHaveBeenCalled();
  const detail = (await api('get', `/${c.id}`).expect(200)).body.contact;
  const list = (await api('get').expect(200)).body.contacts.find(
    (v) => v.id === c.id,
  );
  const duplicate = (
    await api('get', '/duplicates').expect(200)
  ).body.groups[0].contacts.find((v) => v.id === c.id);
  for (const item of [detail, list, duplicate]) {
    expect(item.photoUrl).toContain('signature=');
    expect(item).not.toHaveProperty('photoKey');
  }
});

test('a public share link shows only the name, number and photo, without signing in', async () => {
  const c = await add({
    name: 'بهار رضایی',
    phone: '09123456789',
    birthday: '1996-10-06',
    reminder: 'پنجشنبه زنگ بزن',
  });
  expect(c.shareToken).toMatch(/^[0-9a-f]{32}$/);
  // Every contact gets its own code.
  expect((await add()).shareToken).not.toBe(c.shareToken);
  const shared = await request(app.listener)
    .get(`/api/share/${c.shareToken}`)
    .expect(200);
  expect(shared.headers['cache-control']).toBe('no-store');
  expect(shared.body).toEqual({
    contact: { name: 'بهار رضایی', phone: '09123456789', photoUrl: null },
  });
  // Unknown or malformed codes, and the contact's own id, find nothing.
  for (const token of ['0'.repeat(32), 'not-a-code', c.id])
    await request(app.listener).get(`/api/share/${token}`).expect(404);
  // Deleting the contact ends its link.
  await api('delete', `/${c.id}`).set('Origin', config.origin).expect(204);
  await request(app.listener).get(`/api/share/${c.shareToken}`).expect(404);
});
