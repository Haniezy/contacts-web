import type { Handler } from '../http';
import { parseCookie } from 'cookie';
import { errors } from 'jose';
import { getDatabase } from '../database/client';
import { getAuthConfig } from './config';
import { cookieName, verifyToken } from './tokens';

export interface AuthPrincipal {
  sessionId: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    // Internal; responses carry a signed photoUrl instead.
    photoKey: string | null;
  };
}

// How often "last active" is written; within it requests write nothing.
const seenInterval = 5 * 60 * 1000;

export function requireAuth(
  database = getDatabase,
  config = getAuthConfig,
): Handler {
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
        userAgent: true,
        lastSeenAt: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            photoKey: true,
            twoFactorEnabled: true,
          },
        },
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
    // Remember the device for Settings' device list. Pages rendered on the
    // server carry no user-agent, so they only refresh the time.
    const userAgent = request.headers['user-agent']?.slice(0, 512) || undefined;
    const now = new Date();
    if (
      (userAgent && userAgent !== session.userAgent) ||
      !session.lastSeenAt ||
      now.getTime() - session.lastSeenAt.getTime() > seenInterval
    )
      await database().authSession.update({
        where: { id: claims.jti },
        data: { lastSeenAt: now, ...(userAgent ? { userAgent } : {}) },
      });
    response.locals.auth = {
      sessionId: claims.jti,
      user: {
        id: session.user.id,
        email: session.user.email,
        firstName: session.user.firstName,
        lastName: session.user.lastName,
        photoKey: session.user.photoKey,
      },
    } satisfies AuthPrincipal;
    next();
  };
}
