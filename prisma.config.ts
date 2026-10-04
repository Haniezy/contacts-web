import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/server/database/seed.ts',
  },
  // Generation/build need no credentials. Database commands require DIRECT_URL.
  datasource: { url: process.env.DIRECT_URL ?? '' },
});
