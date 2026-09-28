import assert from 'node:assert/strict';

const frontendUrl = `http://127.0.0.1:${process.env.FRONTEND_PORT || 3000}`;
const backendUrl = `http://127.0.0.1:${process.env.BACKEND_PORT || 4000}`;

for (const [service, url] of [
  ['backend', backendUrl],
  ['frontend', frontendUrl],
]) {
  const response = await fetch(`${url}/health`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200, `${service} health HTTP status`);
  assert.deepEqual(await response.json(), { status: 'ok', service });
  console.log(`PASS ${service}: ${url}/health`);
}

const page = await fetch(frontendUrl, { signal: AbortSignal.timeout(5000) });
assert.equal(page.status, 200, 'Frontend home page HTTP status');
assert.match(await page.text(), /دفترچه تلفن/);
console.log(`PASS frontend home page: ${frontendUrl}`);

if (process.env.DATABASE_URL) {
  const readiness = await fetch(`${backendUrl}/ready`, {
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(readiness.status, 200, 'Backend database readiness HTTP status');
  assert.deepEqual(await readiness.json(), {
    status: 'ok',
    service: 'backend',
    database: 'connected',
  });
  console.log(`PASS backend database readiness: ${backendUrl}/ready`);
}
