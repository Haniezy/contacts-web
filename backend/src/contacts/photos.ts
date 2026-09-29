import { randomUUID } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';

export interface PhotoStore {
  upload(buffer: Buffer, userId: string): Promise<{ key: string }>;
  remove(key: string): Promise<void>;
  url(key: string): Promise<string>;
}
export class ContactError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export async function preparePhoto(buffer: Buffer) {
  try {
    const options = {
      limitInputPixels: 20_000_000,
      failOn: 'warning' as const,
    };
    const meta = await sharp(buffer, options).metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(meta.format ?? '') ||
      (meta.pages ?? 1) !== 1
    )
      throw new Error('Unsupported image');
    // Decode and re-encode: strip metadata, reject spoofed MIME and oversized pixels.
    return await sharp(buffer, options)
      .rotate()
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new ContactError(415, 'INVALID_IMAGE');
  }
}

export const photoUrlSeconds = 300;

export function createS3PhotoStore(
  client: S3Client,
  bucket: string,
): PhotoStore {
  return {
    async upload(buffer, userId) {
      const key = `contacts/${userId}/${randomUUID()}.webp`;
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: 'image/webp',
            CacheControl: 'private, max-age=60',
            ServerSideEncryption: 'AES256',
            IfNoneMatch: '*',
          }),
          { abortSignal: AbortSignal.timeout(30000) },
        );
        return { key };
      } catch {
        throw new ContactError(502, 'PHOTO_UPLOAD_FAILED');
      }
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(30000),
      });
    },
    async url(key) {
      try {
        return await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: bucket, Key: key }),
          { expiresIn: photoUrlSeconds },
        );
      } catch {
        throw new ContactError(503, 'PHOTO_STORAGE_UNAVAILABLE');
      }
    },
  };
}

let store: PhotoStore | undefined;
export function s3Photos(): PhotoStore {
  const region = process.env.AWS_REGION;
  const bucket = process.env.S3_BUCKET;
  if (!region || !bucket)
    throw new ContactError(503, 'PHOTO_STORAGE_NOT_CONFIGURED');
  store ??= createS3PhotoStore(
    new S3Client({ region, maxAttempts: 2 }),
    bucket,
  );
  return store;
}

// Call only after owner-scoped queries; never persist or expose internal keys.
export async function presentContact<
  T extends { photoKey: string | null; photoUrl: string | null },
>(contact: T, userId: string, photos: () => PhotoStore) {
  const { photoKey, ...publicFields } = contact;
  if (photoKey && !photoKey.startsWith(`contacts/${userId}/`))
    throw new ContactError(503, 'INVALID_PHOTO_REFERENCE');
  return {
    ...publicFields,
    photoUrl: photoKey ? await photos().url(photoKey) : contact.photoUrl,
  };
}

// Database changes remain valid if the provider is temporarily unavailable.
// Log only the asset identifier so cleanup can be retried without disclosing keys.
export async function cleanupPhotos(
  store: () => PhotoStore,
  ids: (string | null)[],
) {
  for (const key of new Set(ids.filter((id): id is string => Boolean(id)))) {
    try {
      await store().remove(key);
    } catch {
      console.warn('PHOTO_CLEANUP_REQUIRED', key);
    }
  }
}
