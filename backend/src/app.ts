import express from 'express';

export const app = express();

app.disable('x-powered-by');

app.get('/health', (_request, response) => {
  response.set('Cache-Control', 'no-store').json({
    status: 'ok',
    service: 'backend',
  });
});

app.use((_request, response) => {
  response.status(404).json({ error: 'Not found' });
});
