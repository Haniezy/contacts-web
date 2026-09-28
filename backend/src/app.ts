import express from 'express';
import { checkDatabase } from './database/client.js';

export function createApp(databaseCheck = checkDatabase) {
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

  app.use((_request, response) => {
    response.status(404).json({ error: 'Not found' });
  });

  return app;
}

export const app = createApp();
