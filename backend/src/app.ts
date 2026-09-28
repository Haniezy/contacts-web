import express, { type ErrorRequestHandler } from 'express';
import { checkDatabase } from './database/client.js';
import { authRouter, type AuthOptions } from './auth/routes.js';

export function createApp(
  databaseCheck = checkDatabase,
  authOptions: AuthOptions = {},
) {
  const app = express();

  app.disable('x-powered-by');

  app.get('/health', (_request, response) => {
    response.set('Cache-Control', 'no-store').json({
      status: 'ok',
      service: 'backend',
    });
  });

  app.get('/ready', async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    try {
      await databaseCheck();
      response.json({
        status: 'ok',
        service: 'backend',
        database: 'connected',
      });
    } catch {
      response.status(503).json({ status: 'unavailable', service: 'backend' });
    }
  });

  app.use('/api/auth', authRouter(authOptions));

  app.use((_request, response) => {
    response.status(404).json({ error: 'Not found' });
  });

  const errors: ErrorRequestHandler = (error, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    if (error?.type === 'entity.parse.failed') {
      response.status(400).json({ error: 'INVALID_JSON' });
      return;
    }
    if (error?.type === 'entity.too.large') {
      response.status(413).json({ error: 'BODY_TOO_LARGE' });
      return;
    }
    response.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
  };
  app.use(errors);

  return app;
}

export const app = createApp();
