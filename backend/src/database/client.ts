import '../config/env.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

let database: PrismaClient | undefined;

export function createDatabaseClient(connectionString: string) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database access');
  }

  const adapter = new PrismaPg({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
  });

  return new PrismaClient({
    adapter,
    transactionOptions: { maxWait: 10000, timeout: 10000 },
  });
}

export function getDatabase() {
  database ??= createDatabaseClient(process.env.DATABASE_URL ?? '');
  return database;
}

export async function checkDatabase() {
  await getDatabase().$queryRaw`SELECT 1`;
}

export async function disconnectDatabase() {
  await database?.$disconnect();
  database = undefined;
}
