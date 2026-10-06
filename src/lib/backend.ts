import 'server-only';
import { headers as requestHeaders } from 'next/headers';
import { app } from '@/server/app';

// Server pages call the API in-process, with the visitor's cookies and
// browser (so Settings can name the device of a session).
export async function backendFetch(
  path: string,
  cookie: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set('Cookie', cookie);
  try {
    const agent = (await requestHeaders()).get('user-agent');
    if (agent) headers.set('User-Agent', agent);
  } catch {
    // Outside a request (nothing to forward).
  }
  return app.handle(
    new Request(`http://localhost/api/${path}`, { ...init, headers }),
  );
}
