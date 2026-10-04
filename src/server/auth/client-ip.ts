import { isIP } from 'node:net';

// The visitor's address, for rate limits. On Vercel the platform sets
// X-Real-IP itself (replacing any value the visitor sent). Elsewhere the
// address is not known, so everyone shares one counter.
export function clientIp(request: { get(name: string): string | undefined }) {
  const real = request.get('x-real-ip') ?? '';
  if (process.env.VERCEL && isIP(real)) {
    // An IPv6 visitor is counted per /64 network (one home or device).
    if (isIP(real) === 6)
      return real.split(':').slice(0, 4).join(':') + '::/64';
    return real;
  }
  return 'unknown';
}
