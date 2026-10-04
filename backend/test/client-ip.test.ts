import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';
import { clientIp } from '../src/auth/client-ip.js';

const request = (headers: Record<string, string>) =>
  ({
    ip: '10.0.0.1',
    get: (name: string) => headers[name.toLowerCase()],
  }) as unknown as Request;

test('the visitor address is believed only with the internal key', () => {
  process.env.INTERNAL_API_KEY = 'test-internal-key';
  const visitor = { 'x-client-ip': '203.0.113.7' };
  assert.equal(
    clientIp(request({ ...visitor, 'x-internal-key': 'test-internal-key' })),
    '203.0.113.7',
  );
  assert.equal(clientIp(request(visitor)), '10.0.0.1');
  assert.equal(
    clientIp(request({ ...visitor, 'x-internal-key': 'wrong-internal-key' })),
    '10.0.0.1',
  );
  assert.equal(
    clientIp(
      request({
        'x-client-ip': 'not-an-ip',
        'x-internal-key': 'test-internal-key',
      }),
    ),
    '10.0.0.1',
  );
  // On Vercel, a direct caller is known by the proxy's X-Real-IP.
  process.env.VERCEL = '1';
  assert.equal(
    clientIp(request({ 'x-real-ip': '198.51.100.4' })),
    '198.51.100.4',
  );
  delete process.env.VERCEL;
  assert.equal(clientIp(request({ 'x-real-ip': '198.51.100.4' })), '10.0.0.1');
  delete process.env.INTERNAL_API_KEY;
  assert.equal(
    clientIp(request({ ...visitor, 'x-internal-key': 'test-internal-key' })),
    '10.0.0.1',
  );
});
