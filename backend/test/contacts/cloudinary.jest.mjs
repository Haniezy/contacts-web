import { afterEach, test, expect, jest } from '@jest/globals';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';
import {
  createCloudinaryPhotoStore,
  presentContact,
} from '../../dist/contacts/photos.js';

const owner = randomUUID();
const key = `contacts/${owner}/cloudinary/${randomUUID()}`;
const settings = {
  cloud_name: 'contacts-test',
  api_key: '123456',
  api_secret: 'test-secret-for-offline-signing',
};
const store = () => createCloudinaryPhotoStore(settings);
afterEach(() => jest.restoreAllMocks());

test('uploads a private authenticated WebP with an owner-prefixed random ID', async () => {
  const upload = jest
    .spyOn(cloudinary.uploader, 'upload_stream')
    .mockImplementation(
      (options, callback) =>
        new Writable({
          write(_chunk, _encoding, done) {
            done();
          },
          final(done) {
            callback(null, { public_id: options.public_id });
            done();
          },
        }),
    );
  const first = await store().upload(Buffer.from('validated-webp'), owner);
  const second = await store().upload(Buffer.from('validated-webp'), owner);
  expect(first.key).toMatch(
    new RegExp(`^contacts/${owner}/cloudinary/[a-f0-9-]{36}$`),
  );
  expect(first.key).not.toBe(second.key);
  expect(upload.mock.calls[0][0]).toMatchObject({
    type: 'authenticated',
    resource_type: 'image',
    overwrite: false,
    format: 'webp',
    secure: true,
  });
  expect(first).not.toHaveProperty('url');
});

test('private download URLs carry a genuine signature and a five minute expiry', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
  const result = new URL(await store().url(key));
  expect(result.protocol).toBe('https:');
  expect(result.hostname).toBe('api.cloudinary.com');
  expect(result.searchParams.get('public_id')).toBe(key);
  expect(result.searchParams.get('type')).toBe('authenticated');
  expect(result.searchParams.get('expires_at')).toBe('1700000300');
  expect(result.searchParams.get('signature')).toMatch(/^[a-f0-9]{40,64}$/);
  expect(result.toString()).not.toContain(settings.api_secret);
});

test('cleanup deletes only the specified authenticated image', async () => {
  const remove = jest
    .spyOn(cloudinary.uploader, 'destroy')
    .mockResolvedValue({ result: 'ok' });
  await store().remove(key);
  expect(remove).toHaveBeenCalledWith(
    key,
    expect.objectContaining({
      type: 'authenticated',
      resource_type: 'image',
      invalidate: true,
    }),
  );
});

test('upload errors are sanitized', async () => {
  jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(
    (_options, callback) =>
      new Writable({
        write(_chunk, _encoding, done) {
          done();
        },
        final(done) {
          callback(new Error('sensitive provider detail'));
          done();
        },
      }),
  );
  await expect(
    store().upload(Buffer.from('image'), owner),
  ).rejects.toMatchObject({
    status: 502,
    code: 'PHOTO_UPLOAD_FAILED',
    message: 'PHOTO_UPLOAD_FAILED',
  });
});

test('old S3 keys cannot be signed or deleted as Cloudinary assets', async () => {
  const remove = jest.spyOn(cloudinary.uploader, 'destroy');
  const oldKey = `contacts/${owner}/${randomUUID()}.webp`;
  await expect(store().url(oldKey)).rejects.toMatchObject({
    code: 'UNSUPPORTED_PHOTO_REFERENCE',
  });
  await expect(store().remove(oldKey)).rejects.toMatchObject({
    code: 'UNSUPPORTED_PHOTO_REFERENCE',
  });
  expect(remove).not.toHaveBeenCalled();
});

test('public DTO removes the key and refuses another owner reference', async () => {
  const url = jest.fn().mockResolvedValue('https://signed.example/photo');
  const photos = () => ({ url });
  const contact = { id: 'contact', photoKey: key, photoUrl: null };
  expect(await presentContact(contact, owner, photos)).toEqual({
    id: 'contact',
    photoUrl: 'https://signed.example/photo',
  });
  url.mockClear();
  await expect(
    presentContact(contact, randomUUID(), photos),
  ).rejects.toMatchObject({ code: 'INVALID_PHOTO_REFERENCE' });
  expect(url).not.toHaveBeenCalled();
});
