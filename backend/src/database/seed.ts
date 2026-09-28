import { disconnectDatabase, getDatabase } from './client.js';
import { seedDatabase } from './seed-data.js';

try {
  const result = await seedDatabase(getDatabase());
  console.log(
    `Seed complete: demo account and ${result.contacts} sample contacts.`,
  );
} catch {
  console.error(
    'Seed failed. Check database connectivity and migration status.',
  );
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
