import type { RequestHandler } from 'express';
import { parseCookie } from 'cookie';
import { errors } from 'jose';
import { getDatabase } from '../database/client.js';
import { getAuthConfig } from './config.js';
import { cookieName, verifyToken } from './tokens.js';

export interface AuthPrincipal {
  sessionId: string;
  user: { id: string; email: string };
}

export function requireAuth(
  database = getDatabase,
  config = getAuthConfig,
): RequestHandler {
  return async (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    const unauthorized = () => {
      response.status(401).json({ error: 'UNAUTHENTICATED' });
    };
    const token = parseCookie(request.headers.cookie ?? '')[cookieName];
    if (!token) return unauthorized();
    let claims;
    try {
      claims = await verifyToken(token, config());
    } catch (error) {
      if (error instanceof errors.JOSEError) return unauthorized();
      throw error;
    }
    if (!claims) return unauthorized();
    const session = await database().authSession.findUnique({
      where: { id: claims.jti },
      select: {
        userId: true,
        expiresAt: true,
        twoFactorVerified: true,
        user: { select: { id: true, email: true, twoFactorEnabled: true } },
      },
    });
    if (
      !session ||
      session.userId !== claims.sub ||
      session.expiresAt <= new Date() ||
      (session.user.twoFactorEnabled && !session.twoFactorVerified)
    ) {
      return unauthorized();
    }
    response.locals.auth = {
      sessionId: claims.jti,
      user: { id: session.user.id, email: session.user.email },
    } satisfies AuthPrincipal;
    next();
  };
}
