import { app } from './app.js';
import { disconnectDatabase } from './database/client.js';

const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Backend listening on port ${port}`);
});

server.on('error', (error) => {
  console.error('Backend failed to start:', error.message);
  process.exit(1);
});

function shutdown(signal: string) {
  console.log(`${signal} received; closing HTTP server`);
  const timeout = setTimeout(() => process.exit(1), 8000);
  timeout.unref();

  server.close(async (error) => {
    try {
      await disconnectDatabase();
      clearTimeout(timeout);
      process.exit(error ? 1 : 0);
    } catch {
      process.exit(1);
    }
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
