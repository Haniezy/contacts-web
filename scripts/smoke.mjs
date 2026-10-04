import assert from 'node:assert/strict';

// Checks a running app (docker compose up, or npm run start): health, the
// home page and, with DATABASE_URL set, the database connection.
const url = `http://127.0.0.1:${process.env.APP_PORT || process.env.FRONTEND_PORT || 3000}`;

const health = await fetch(`${url}/health`, {
  signal: AbortSignal.timeout(5000),
});
assert.equal(health.status, 200, 'health HTTP status');
assert.deepEqual(await health.json(), {
  status: 'ok',
  service: 'contacts-web',
});
console.log(`PASS health: ${url}/health`);

const page = await fetch(url, { signal: AbortSignal.timeout(5000) });
assert.equal(page.status, 200, 'home page HTTP status');
assert.match(await page.text(), /دفترچه تلفن/);
console.log(`PASS home page: ${url}`);

if (process.env.DATABASE_URL) {
  const readiness = await fetch(`${url}/ready`, {
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(readiness.status, 200, 'database readiness HTTP status');
  assert.deepEqual(await readiness.json(), {
    status: 'ok',
    service: 'contacts-web',
    database: 'connected',
  });
  console.log(`PASS database readiness: ${url}/ready`);
}
