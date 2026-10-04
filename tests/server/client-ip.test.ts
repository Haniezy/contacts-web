import assert from 'node:assert/strict';
import test from 'node:test';
import { clientIp } from '../../src/server/auth/client-ip';

const request = (headers: Record<string, string>) => ({
  get: (name: string) => headers[name.toLowerCase()],
});

test('the visitor address comes from Vercel only', () => {
  const visitor = request({ 'x-real-ip': '198.51.100.4' });
  delete process.env.VERCEL;
  assert.equal(clientIp(visitor), 'unknown');
  process.env.VERCEL = '1';
  assert.equal(clientIp(visitor), '198.51.100.4');
  assert.equal(clientIp(request({ 'x-real-ip': 'not-an-ip' })), 'unknown');
  assert.equal(
    clientIp(request({ 'x-real-ip': '2001:db8:1:2:3:4:5:6' })),
    '2001:db8:1:2::/64',
  );
  delete process.env.VERCEL;
});
