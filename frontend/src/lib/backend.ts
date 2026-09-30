import 'server-only';

export const backendOrigin =
  process.env.BACKEND_INTERNAL_URL ?? 'http://127.0.0.1:4000';
export const appOrigin = new URL(
  process.env.APP_ORIGIN ?? 'http://localhost:3000',
).origin;

export function authCookies(raw: string) {
  return raw
    .split(';')
    .map((value) => value.trim())
    .filter((value) =>
      /^(contacts_session|contacts_2fa_challenge)=/.test(value),
    )
    .join('; ');
}

export function backendFetch(
  path: string,
  cookie: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set('Cookie', authCookies(cookie));
  return fetch(`${backendOrigin}/api/${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(12000),
  });
}
