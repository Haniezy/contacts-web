import { NextRequest, NextResponse } from 'next/server';
import { appOrigin, backendFetch } from '@/lib/backend';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
type Body = 'json' | 'multipart';
// Only these backend routes are reachable from the browser.
const routes: [RegExp, Record<string, Body | null>][] = [
  [/^auth\/(signup|login|logout)$/, { POST: 'json' }],
  [/^auth\/me$/, { GET: null }],
  [/^auth\/2fa\/status$/, { GET: null }],
  [/^auth\/2fa\/(setup|confirm|verify)$/, { POST: 'json' }],
  [/^contacts$/, { GET: null, POST: 'json' }],
  [/^contacts\/duplicates$/, { GET: null }],
  [/^contacts\/duplicates\/ignore$/, { POST: 'json' }],
  [/^contacts\/merge$/, { POST: 'json' }],
  [
    new RegExp(`^contacts/${uuid}$`, 'i'),
    { GET: null, PATCH: 'json', DELETE: null },
  ],
  [
    new RegExp(`^contacts/${uuid}/photo$`, 'i'),
    { POST: 'multipart', DELETE: null },
  ],
];
const limits = { json: 8192, multipart: 5 * 1024 * 1024 + 64 * 1024 };

function route(path: string, method: string) {
  const methods = routes.find(([pattern]) => pattern.test(path))?.[1];
  return methods && Object.hasOwn(methods, method)
    ? { body: methods[method] }
    : null;
}

async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join('/');
  const match = route(path, request.method);
  if (!match) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  const mutation = request.method !== 'GET';
  if (
    mutation &&
    (request.headers.get('origin') !== appOrigin ||
      request.headers.get('sec-fetch-site') === 'cross-site')
  ) {
    return NextResponse.json({ error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
  }
  const kind = match.body;
  const type = request.headers.get('content-type') ?? '';
  if (kind === 'json' && type.split(';')[0].trim() !== 'application/json')
    return NextResponse.json({ error: 'JSON_REQUIRED' }, { status: 415 });
  if (kind === 'multipart' && !type.startsWith('multipart/form-data'))
    return NextResponse.json({ error: 'MULTIPART_REQUIRED' }, { status: 415 });
  try {
    // Bound streamed request size too, not just the untrusted Content-Length header.
    let body: ArrayBuffer | undefined;
    if (kind && request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limits[kind]) {
          await reader.cancel();
          return NextResponse.json(
            { error: 'BODY_TOO_LARGE' },
            { status: 413 },
          );
        }
        chunks.push(value);
      }
      const bytes = Buffer.concat(chunks);
      body = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
    }
    const upstream = await backendFetch(
      path + request.nextUrl.search,
      request.headers.get('cookie') ?? '',
      {
        method: request.method,
        body,
        headers: kind
          ? { 'Content-Type': type, Origin: appOrigin }
          : mutation
            ? { Origin: appOrigin }
            : {},
      },
      // Photo uploads are processed and stored before the backend answers.
      kind === 'multipart' ? 45000 : undefined,
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
export const PATCH = handle;
export const DELETE = handle;
