import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import type { CookieOptions, Res } from '../http';
import type { AuthConfig } from './config';

export const cookieName = 'contacts_session';
export const sessionSeconds = 60 * 60;

export function cookieOptions(config: AuthConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secureCookie,
    sameSite: 'lax',
    path: '/',
  };
}

export async function createToken(
  userId: string,
  sessionId: string,
  config: AuthConfig,
  expiresAt: Date,
) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setJti(sessionId)
    .setIssuer('contacts-web')
    .setAudience('contacts-web')
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(config.secret);
}

export async function verifyToken(token: string, config: AuthConfig) {
  const { payload } = await jwtVerify(token, config.secret, {
    algorithms: ['HS256'],
    issuer: 'contacts-web',
    audience: 'contacts-web',
    typ: 'JWT',
    requiredClaims: ['sub', 'jti', 'iat', 'exp'],
  });
  const claims = z.object({ sub: z.uuid(), jti: z.uuid() }).safeParse(payload);
  return claims.success ? claims.data : null;
}

export async function setSessionCookie(
  response: Res,
  userId: string,
  sessionId: string,
  config: AuthConfig,
  expiresAt: Date,
) {
  response.cookie(
    cookieName,
    await createToken(userId, sessionId, config, expiresAt),
    {
      ...cookieOptions(config),
      expires: expiresAt,
    },
  );
}
