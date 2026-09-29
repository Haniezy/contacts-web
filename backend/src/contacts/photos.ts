import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';

export interface PhotoStore {
  upload(
    buffer: Buffer,
    userId: string,
  ): Promise<{ url: string; publicId: string }>;
  remove(publicId: string): Promise<void>;
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

export function cloudinaryPhotos(): PhotoStore {
  const {
    CLOUDINARY_CLOUD_NAME: cloud_name,
    CLOUDINARY_API_KEY: api_key,
    CLOUDINARY_API_SECRET: api_secret,
  } = process.env;
  if (!cloud_name || !api_key || !api_secret)
    throw new ContactError(503, 'PHOTO_STORAGE_NOT_CONFIGURED');
  const options = {
    cloud_name,
    api_key,
    api_secret,
    secure: true,
    timeout: 30000,
  };
  return {
    upload: (buffer, userId) =>
      new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              ...options,
              resource_type: 'image',
              public_id: `contacts/${userId}/${randomUUID()}`,
              overwrite: false,
              format: 'webp',
            },
            (error, result) => {
              if (error || !result?.secure_url || !result.public_id) {
                reject(new ContactError(502, 'PHOTO_UPLOAD_FAILED'));
                return;
              }
              resolve({ url: result.secure_url, publicId: result.public_id });
            },
          )
          .end(buffer);
      }),
    async remove(publicId) {
      await cloudinary.uploader.destroy(publicId, {
        ...options,
        resource_type: 'image',
        invalidate: true,
      });
    },
  };
}

// Database changes remain valid if the provider is temporarily unavailable.
// Log only the asset identifier so cleanup can be retried without disclosing keys.
export async function cleanupPhotos(
  store: () => PhotoStore,
  ids: (string | null)[],
) {
  for (const publicId of new Set(
    ids.filter((id): id is string => Boolean(id)),
  )) {
    try {
      await store().remove(publicId);
    } catch {
      console.warn('PHOTO_CLEANUP_REQUIRED', publicId);
    }
  }
}
