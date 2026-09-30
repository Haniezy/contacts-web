import { NextRequest, NextResponse } from 'next/server';
import { appOrigin, backendFetch } from '@/lib/backend';

const allowed = new Map([
  ['auth/signup', 'POST'],
  ['auth/login', 'POST'],
  ['auth/logout', 'POST'],
  ['auth/me', 'GET'],
  ['auth/2fa/status', 'GET'],
  ['auth/2fa/setup', 'POST'],
  ['auth/2fa/confirm', 'POST'],
  ['auth/2fa/verify', 'POST'],
  ['contacts', 'GET'],
  ['contacts/duplicates', 'GET'],
]);
const contactId =
  /^contacts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function permitted(path: string, method: string) {
  return (
    allowed.get(path) === method ||
    (method === 'DELETE' && contactId.test(path))
  );
}

async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join('/');
  if (!permitted(path, request.method))
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  const mutation = request.method !== 'GET';
  if (
    mutation &&
    (request.headers.get('origin') !== appOrigin ||
      request.headers.get('sec-fetch-site') === 'cross-site')
  ) {
    return NextResponse.json({ error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
  }
  const hasBody = mutation && request.method !== 'DELETE';
  if (
    hasBody &&
    request.headers.get('content-type')?.split(';')[0].trim() !==
      'application/json'
  ) {
    return NextResponse.json({ error: 'JSON_REQUIRED' }, { status: 415 });
  }
  try {
    // Bound streamed request size too, not just the untrusted Content-Length header.
    let body: string | undefined;
    if (hasBody && request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8192) {
          await reader.cancel();
          return NextResponse.json(
            { error: 'BODY_TOO_LARGE' },
            { status: 413 },
          );
        }
        chunks.push(value);
      }
      body = Buffer.concat(chunks).toString('utf8');
    }
    const upstream = await backendFetch(
      path + request.nextUrl.search,
      request.headers.get('cookie') ?? '',
      {
        method: request.method,
        body,
        headers: hasBody
          ? { 'Content-Type': 'application/json', Origin: appOrigin }
          : mutation
            ? { Origin: appOrigin }
            : {},
      },
    );
    const response = new NextResponse(
      upstream.status === 204 ? null : await upstream.text(),
      {
        status: upstream.status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      },
    );
    for (const cookie of upstream.headers.getSetCookie()) {
      if (!/^(contacts_session|contacts_2fa_challenge)=/.test(cookie)) continue;
      // Clear legacy API-scoped cookies; pages need the HttpOnly cookie at root.
      const name = cookie.split('=')[0];
      const legacyPath = name === 'contacts_session' ? '/api' : '/api/auth/2fa';
      response.headers.append(
        'Set-Cookie',
        `${name}=; Path=${legacyPath}; Max-Age=0; HttpOnly; SameSite=Lax`,
      );
      response.headers.append(
        'Set-Cookie',
        cookie.replace(/Path=[^;]+/i, 'Path=/'),
      );
    }
    const retry = upstream.headers.get('retry-after');
    if (retry) response.headers.set('Retry-After', retry);
    return response;
  } catch {
    return NextResponse.json(
      { error: 'SERVICE_UNAVAILABLE' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
