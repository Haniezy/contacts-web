import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import type { AuthConfig } from './config';

function encryptionKey(config: AuthConfig) {
  if (config.twoFactorKey?.byteLength !== 32)
    throw new Error('2FA encryption key is not configured');
  return config.twoFactorKey;
}

export function encryptSecret(
  secret: string,
  userId: string,
  config: AuthConfig,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(config), iv);
  cipher.setAAD(Buffer.from(`contacts:totp:v1:${userId}`));
  const encrypted = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('hex'),
    cipher.getAuthTag().toString('hex'),
    encrypted.toString('hex'),
  ].join('.');
}

export function decryptSecret(
  encrypted: string,
  userId: string,
  config: AuthConfig,
) {
  if (!/^v1\.[a-f0-9]{24}\.[a-f0-9]{32}\.[a-f0-9]+$/.test(encrypted))
    throw new Error('Invalid encrypted secret');
  const [, iv, tag, payload] = encrypted.split('.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(config),
    Buffer.from(iv, 'hex'),
  );
  decipher.setAAD(Buffer.from(`contacts:totp:v1:${userId}`));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

export async function enrollment(
  userId: string,
  email: string,
  config: AuthConfig,
) {
  const secret = generateSecret();
  const encrypted = encryptSecret(secret, userId, config);
  const uri = generateURI({
    issuer: 'Contacts Web',
    label: email,
    secret,
    digits: 6,
    period: 30,
    algorithm: 'sha1',
  });
  const qrCodeDataUrl = await QRCode.toDataURL(uri, {
    width: 320,
    margin: 4,
    errorCorrectionLevel: 'M',
  });
  return { secret, encrypted, uri, qrCodeDataUrl };
}

export async function verifyTotp(
  secret: string,
  code: string,
  now: Date,
  lastStep: number | null,
) {
  const result = await verify({
    secret,
    token: code,
    strategy: 'totp',
    digits: 6,
    period: 30,
    algorithm: 'sha1',
    epoch: Math.floor(now.getTime() / 1000),
    epochTolerance: 30,
    afterTimeStep: lastStep ?? undefined,
  });
  return result.valid && 'timeStep' in result ? result.timeStep : null;
}

export function recoveryHash(userId: string, code: string) {
  const normalized = code.replaceAll('-', '').toLowerCase();
  return createHash('sha256')
    .update(`contacts:recovery:v1:${userId}:${normalized}`)
    .digest('hex');
}

export function recoveryCodes(userId: string) {
  const codes = Array.from({ length: 10 }, () =>
    randomBytes(16).toString('hex').match(/.{8}/g)!.join('-'),
  );
  return { codes, hashes: codes.map((code) => recoveryHash(userId, code)) };
}

export function findRecoveryHash(hashes: string[], candidate: string) {
  return hashes.findIndex(
    (hash) =>
      /^[a-f0-9]{64}$/.test(hash) &&
      timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex')),
  );
}

export function challengeHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
