import 'server-only';
import { app } from '@/server/app';

// Server pages call the API in-process, with the visitor's cookies.
export function backendFetch(
  path: string,
  cookie: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set('Cookie', cookie);
  return app.handle(
    new Request(`http://localhost/api/${path}`, { ...init, headers }),
  );
}
