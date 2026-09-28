import { randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { AuthConfig } from './config.js';
import type { AuthPrincipal } from './middleware.js';
import { verifyPassword } from './password.js';
import { sessionSeconds } from './tokens.js';
import {
  challengeHash,
  decryptSecret,
  enrollment,
  findRecoveryHash,
  recoveryCodes,
  recoveryHash,
  verifyTotp,
} from './two-factor-crypto.js';

export const challengeSeconds = 5 * 60;
export const maxCodeAttempts = 5;
const setupSeconds = 10 * 60;
const failure = (status: number, error: string) => ({
  ok: false as const,
  status,
  error,
});

async function lockUser(transaction: Prisma.TransactionClient, userId: string) {
  await transaction.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
}

// Enrollment, login and verification lock the same user first, in the same order.
export async function issueLogin(
  database: PrismaClient,
  userId: string,
  passwordHash: string,
  now: Date,
) {
  return database.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.passwordHash !== passwordHash)
      return failure(401, 'INVALID_CREDENTIALS');
    if (user.twoFactorEnabled) {
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(now.getTime() + challengeSeconds * 1000);
      await tx.loginChallenge.deleteMany({
        where: { userId, expiresAt: { lte: now } },
      });
      await tx.loginChallenge.create({
        data: { tokenHash: challengeHash(token), userId, expiresAt },
      });
      return {
        ok: true as const,
        kind: 'challenge' as const,
        token,
        expiresAt,
      };
    }
    const expiresAt = new Date(now.getTime() + sessionSeconds * 1000);
    const session = await tx.authSession.create({
      data: { userId, expiresAt },
    });
    return {
      ok: true as const,
      kind: 'session' as const,
      session,
      user: { id: user.id, email: user.email },
      expiresAt,
    };
  });
}

export async function setupTwoFactor(
  database: PrismaClient,
  principal: AuthPrincipal,
  password: string,
  config: AuthConfig,
  now: Date,
) {
  const user = await database.user.findUnique({
    where: { id: principal.user.id },
  });
  if (!user || !(await verifyPassword(password, user.passwordHash)))
    return failure(401, 'INVALID_CREDENTIALS');
  if (user.twoFactorEnabled) return failure(409, 'TWO_FACTOR_ALREADY_ENABLED');
  const data = await enrollment(user.id, user.email, config);
  return database.$transaction(async (tx) => {
    await lockUser(tx, user.id);
    const current = await tx.user.findUnique({ where: { id: user.id } });
    const session = await tx.authSession.findUnique({
      where: { id: principal.sessionId },
    });
    if (
      !current ||
      !session ||
      session.expiresAt <= now ||
      current.passwordHash !== user.passwordHash
    )
      return failure(401, 'UNAUTHENTICATED');
    if (current.twoFactorEnabled)
      return failure(409, 'TWO_FACTOR_ALREADY_ENABLED');
    const expiresAt = new Date(now.getTime() + setupSeconds * 1000);
    await tx.user.update({
      where: { id: user.id },
      data: {
        twoFactorSecretEncrypted: data.encrypted,
        twoFactorSetupExpiresAt: expiresAt,
        twoFactorSetupSessionId: principal.sessionId,
        twoFactorSetupAttempts: 0,
        twoFactorLastStep: null,
      },
    });
    return {
      ok: true as const,
      secret: data.secret,
      otpauthUri: data.uri,
      qrCodeDataUrl: data.qrCodeDataUrl,
      expiresAt,
    };
  });
}

export async function confirmTwoFactor(
  database: PrismaClient,
  principal: AuthPrincipal,
  code: string,
  config: AuthConfig,
  now: Date,
) {
  return database.$transaction(async (tx) => {
    await lockUser(tx, principal.user.id);
    const user = await tx.user.findUnique({ where: { id: principal.user.id } });
    const session = await tx.authSession.findUnique({
      where: { id: principal.sessionId },
    });
    if (!user || !session || session.expiresAt <= now)
      return failure(401, 'UNAUTHENTICATED');
    if (user.twoFactorEnabled)
      return failure(409, 'TWO_FACTOR_ALREADY_ENABLED');
    if (
      !user.twoFactorSecretEncrypted ||
      !user.twoFactorSetupExpiresAt ||
      user.twoFactorSetupExpiresAt <= now ||
      user.twoFactorSetupSessionId !== principal.sessionId
    )
      return failure(400, 'SETUP_REQUIRED');
    if (user.twoFactorSetupAttempts >= maxCodeAttempts)
      return failure(429, 'TOO_MANY_ATTEMPTS');
    const step = await verifyTotp(
      decryptSecret(user.twoFactorSecretEncrypted, user.id, config),
      code,
      now,
      null,
    );
    if (step === null) {
      await tx.user.update({
        where: { id: user.id },
        data: { twoFactorSetupAttempts: { increment: 1 } },
      });
      return failure(401, 'INVALID_TWO_FACTOR_CODE');
    }
    const recovery = recoveryCodes(user.id);
    await tx.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: true,
        twoFactorLastStep: step,
        recoveryCodeHashes: recovery.hashes,
        twoFactorSetupExpiresAt: null,
        twoFactorSetupSessionId: null,
        twoFactorSetupAttempts: 0,
      },
    });
    await tx.authSession.deleteMany({ where: { userId: user.id } });
    await tx.loginChallenge.deleteMany({ where: { userId: user.id } });
    const expiresAt = new Date(now.getTime() + sessionSeconds * 1000);
    const verifiedSession = await tx.authSession.create({
      data: { userId: user.id, expiresAt, twoFactorVerified: true },
    });
    return {
      ok: true as const,
      user: { id: user.id, email: user.email },
      session: verifiedSession,
      expiresAt,
      recoveryCodes: recovery.codes,
    };
  });
}

export type TwoFactorInput = { code: string } | { recoveryCode: string };

export async function completeTwoFactor(
  database: PrismaClient,
  token: string,
  input: TwoFactorInput,
  config: AuthConfig,
  now: Date,
) {
  const tokenHash = challengeHash(token);
  const initial = await database.loginChallenge.findUnique({
    where: { tokenHash },
    select: { userId: true },
  });
  if (!initial) return failure(401, 'INVALID_CHALLENGE');
  return database.$transaction(async (tx) => {
    await lockUser(tx, initial.userId);
    const challenge = await tx.loginChallenge.findUnique({
      where: { tokenHash },
    });
    if (!challenge || challenge.expiresAt <= now)
      return failure(401, 'INVALID_CHALLENGE');
    if (challenge.attempts >= maxCodeAttempts)
      return failure(429, 'TOO_MANY_ATTEMPTS');
    const user = await tx.user.findUnique({ where: { id: challenge.userId } });
    if (!user?.twoFactorEnabled || !user.twoFactorSecretEncrypted)
      return failure(401, 'INVALID_CHALLENGE');

    let step: number | null = null;
    let recoveryIndex = -1;
    if ('code' in input) {
      step = await verifyTotp(
        decryptSecret(user.twoFactorSecretEncrypted, user.id, config),
        input.code,
        now,
        user.twoFactorLastStep,
      );
    } else {
      recoveryIndex = findRecoveryHash(
        user.recoveryCodeHashes,
        recoveryHash(user.id, input.recoveryCode),
      );
    }
    if (step === null && recoveryIndex === -1) {
      await tx.loginChallenge.update({
        where: { tokenHash },
        data: { attempts: { increment: 1 } },
      });
      return failure(401, 'INVALID_TWO_FACTOR_CODE');
    }
    await tx.user.update({
      where: { id: user.id },
      data:
        step !== null
          ? { twoFactorLastStep: step }
          : {
              recoveryCodeHashes: user.recoveryCodeHashes.filter(
                (_, index) => index !== recoveryIndex,
              ),
            },
    });
    await tx.loginChallenge.delete({ where: { tokenHash } });
    const expiresAt = new Date(now.getTime() + sessionSeconds * 1000);
    const session = await tx.authSession.create({
      data: { userId: user.id, expiresAt, twoFactorVerified: true },
    });
    return {
      ok: true as const,
      user: { id: user.id, email: user.email },
      session,
      expiresAt,
    };
  });
}
