import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { Readable } from 'node:stream';
import { checkDatabase } from './database/client';
import { authRouter, type AuthOptions } from './auth/routes';
import { contactsRouter, type ContactOptions } from './contacts/routes';
import { accountRouter } from './account/routes';
import { shareRouter } from './contacts/share-routes';
import { ContactError } from './contacts/photos';
import { BodyError, Req, Res, Router, UploadError } from './http';

// The whole API. Next.js serves it from src/app/api/[...path]/route.ts (and
// /health, /ready); tests can also listen on a port of their own.
export function createApp(
  databaseCheck = checkDatabase,
  authOptions: AuthOptions = {},
  contactOptions: ContactOptions = {},
) {
  const router = new Router();

  router.get('/health', (_request, response) => {
    response.set('Cache-Control', 'no-store').json({
      status: 'ok',
      service: 'contacts-web',
    });
  });

  router.get('/ready', async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    try {
      await databaseCheck();
      response.json({
        status: 'ok',
        service: 'contacts-web',
        database: 'connected',
      });
    } catch {
      response
        .status(503)
        .json({ status: 'unavailable', service: 'contacts-web' });
    }
  });

  router.use('/api/auth', authRouter(authOptions, contactOptions.photos));
  router.use('/api/contacts', contactsRouter(authOptions, contactOptions));
  router.use('/api/account', accountRouter(authOptions, contactOptions));
  // Public, no sign-in: a shared contact's name, number and photo.
  router.use('/api/share', shareRouter(authOptions, contactOptions));

  async function handle(request: Request) {
    const req = new Req(request);
    const res = new Res();
    try {
      if (await router.handle(req, res))
        res.status(404).json({ error: 'Not found' });
    } catch (error) {
      if (!res.headersSent) failed(error, res);
    }
    return res.toResponse();
  }

  // A Node.js listener over the same handler, for tests and local tools.
  async function listener(incoming: IncomingMessage, outgoing: ServerResponse) {
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers))
      for (const item of [value ?? []].flat()) headers.append(key, item);
    const hasBody = !['GET', 'HEAD'].includes(incoming.method ?? 'GET');
    const response = await handle(
      new Request(
        `http://${incoming.headers.host ?? 'localhost'}${incoming.url}`,
        {
          method: incoming.method,
          headers,
          body: hasBody
            ? (Readable.toWeb(incoming) as unknown as ReadableStream)
            : undefined,
          duplex: 'half',
        } as RequestInit,
      ),
    );
    outgoing.statusCode = response.status;
    for (const [key, value] of response.headers)
      if (key !== 'set-cookie') outgoing.setHeader(key, value);
    const cookies = response.headers.getSetCookie();
    if (cookies.length) outgoing.setHeader('Set-Cookie', cookies);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  }

  return {
    handle,
    listener,
    listen: (port: number, host: string) =>
      createServer(
        (incoming, outgoing) => void listener(incoming, outgoing),
      ).listen(port, host),
  };
}

function failed(error: unknown, response: Res) {
  if (error instanceof BodyError) {
    if (error.type === 'entity.parse.failed')
      response.status(400).json({ error: 'INVALID_JSON' });
    else response.status(413).json({ error: 'BODY_TOO_LARGE' });
    return;
  }
  if (error instanceof ContactError) {
    response.status(error.status).json({ error: error.code });
    return;
  }
  if (error instanceof UploadError) {
    response
      .status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
      .json({ error: error.code });
    return;
  }
  console.error(error);
  response.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
}

export const app = createApp();
