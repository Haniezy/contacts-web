import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
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

interface CloudinarySettings {
  cloud_name: string;
  api_key: string;
  api_secret: string;
}

export function createCloudinaryPhotoStore(
  settings: CloudinarySettings,
): PhotoStore {
  const options = {
    ...settings,
    secure: true,
    resource_type: 'image' as const,
    type: 'authenticated',
    timeout: 30000,
  };
  const validateKey = (key: string) => {
    if (!/^contacts\/[a-f0-9-]{36}\/cloudinary\/[a-f0-9-]{36}$/.test(key))
      throw new ContactError(503, 'UNSUPPORTED_PHOTO_REFERENCE');
  };
  return {
    upload(buffer, userId) {
      const key = `contacts/${userId}/cloudinary/${randomUUID()}`;
      return new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            { ...options, public_id: key, overwrite: false, format: 'webp' },
            (error, result) => {
              if (error || result?.public_id !== key) {
                reject(new ContactError(502, 'PHOTO_UPLOAD_FAILED'));
                return;
              }
              resolve({ key });
            },
          )
          .end(buffer);
      });
    },
    async remove(key) {
      validateKey(key);
      const result = await cloudinary.uploader.destroy(key, {
        ...options,
        invalidate: true,
      });
      if (!['ok', 'not found'].includes(result.result))
        throw new Error('Photo cleanup failed');
    },
    async url(key) {
      validateKey(key);
      return cloudinary.utils.private_download_url(key, 'webp', {
        ...options,
        expires_at: Math.floor(Date.now() / 1000) + photoUrlSeconds,
        attachment: false,
      });
    },
  };
}

export function cloudinaryPhotos(): PhotoStore {
  const {
    CLOUDINARY_CLOUD_NAME: cloud_name,
    CLOUDINARY_API_KEY: api_key,
    CLOUDINARY_API_SECRET: api_secret,
  } = process.env;
  if (!cloud_name || !api_key || !api_secret)
    throw new ContactError(503, 'PHOTO_STORAGE_NOT_CONFIGURED');
  return createCloudinaryPhotoStore({ cloud_name, api_key, api_secret });
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
