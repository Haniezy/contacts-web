import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';

// Browsers reach the API through the web app's server, so request.ip is that
// server for everyone. On a host that sets the visitor's address (Vercel's
// X-Real-IP), the web app passes it on as X-Client-IP together with the
// shared INTERNAL_API_KEY; the header is believed only with that key.
export function clientIp(request: Request) {
  const key = process.env.INTERNAL_API_KEY;
  const given = request.get('x-internal-key') ?? '';
  const forwarded = request.get('x-client-ip') ?? '';
  if (
    key &&
    given.length === key.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(key)) &&
    isIP(forwarded)
  )
    return forwarded;
  // On Vercel the connection comes from its proxy, which puts the caller's
  // address in X-Real-IP (and replaces any value the caller sent).
  const real = request.get('x-real-ip') ?? '';
  if (process.env.VERCEL && isIP(real)) return real;
  return request.ip ?? '';
}

// Rate limits count per visitor (IPv6 addresses per /56 network).
export const rateLimitKey = (request: Request) =>
  ipKeyGenerator(clientIp(request));
