import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Works from both src/config and dist/config; shell/Compose values take priority.
config({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
});
