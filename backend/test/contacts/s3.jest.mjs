import { test, expect, jest } from '@jest/globals';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import {
  createS3PhotoStore,
  presentContact,
} from '../../dist/contacts/photos.js';

const make = () => {
  const client = new S3Client({
    region: 'eu-central-1',
    credentials: {
      accessKeyId: 'TESTACCESSKEY',
      secretAccessKey: 'test-secret-for-offline-signing',
    },
  });
  const send = jest.spyOn(client, 'send').mockResolvedValue({});
  return {
    client,
    send,
    store: createS3PhotoStore(client, 'contacts-test-photos'),
  };
};

test('S3 upload uses an unpredictable owner-prefixed key, encryption and no public ACL', async () => {
  const { client, send, store } = make();
  try {
    const image = Buffer.from('validated-webp');
    const first = await store.upload(image, 'owner'),
      second = await store.upload(image, 'owner');
    expect(first.key).toMatch(/^contacts\/owner\/[a-f0-9-]{36}\.webp$/);
    expect(first.key).not.toBe(second.key);
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'contacts-test-photos',
      Body: image,
      ContentType: 'image/webp',
      ServerSideEncryption: 'AES256',
      CacheControl: 'private, max-age=60',
      IfNoneMatch: '*',
    });
    expect(command.input.ACL).toBeUndefined();
    expect(first).not.toHaveProperty('url');
  } finally {
    client.destroy();
  }
});

test('read URLs use genuine AWS signatures, expire in five minutes, and need no S3 request', async () => {
  const { client, send, store } = make();
  try {
    const url = new URL(await store.url('contacts/owner/photo.webp'));
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe(
      'contacts-test-photos.s3.eu-central-1.amazonaws.com',
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(url.toString()).not.toContain('test-secret-for-offline-signing');
    expect(send).not.toHaveBeenCalled();
  } finally {
    client.destroy();
  }
});

test('S3 cleanup deletes only the supplied object in the configured bucket', async () => {
  const { client, send, store } = make();
  try {
    await store.remove('contacts/owner/photo.webp');
    expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: 'contacts-test-photos',
      Key: 'contacts/owner/photo.webp',
    });
  } finally {
    client.destroy();
  }
});

test('provider errors are sanitized', async () => {
  const { client, send, store } = make();
  try {
    send.mockRejectedValue(new Error('sensitive upstream error'));
    await expect(
      store.upload(Buffer.from('image'), 'owner'),
    ).rejects.toMatchObject({
      status: 502,
      code: 'PHOTO_UPLOAD_FAILED',
      message: 'PHOTO_UPLOAD_FAILED',
    });
  } finally {
    client.destroy();
  }
});

test('presentation removes internal key and never signs a foreign owner reference', async () => {
  const url = jest.fn().mockResolvedValue('https://signed.example/photo');
  const store = () => ({ url });
  const contact = {
    id: 'contact',
    photoKey: 'contacts/owner/photo.webp',
    photoUrl: null,
  };
  expect(await presentContact(contact, 'owner', store)).toEqual({
    id: 'contact',
    photoUrl: 'https://signed.example/photo',
  });
  url.mockClear();
  await expect(presentContact(contact, 'other', store)).rejects.toMatchObject({
    code: 'INVALID_PHOTO_REFERENCE',
  });
  expect(url).not.toHaveBeenCalled();
});
