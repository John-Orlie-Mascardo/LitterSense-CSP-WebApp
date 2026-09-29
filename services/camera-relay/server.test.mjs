import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createRelay, verifyTicket } from './server.mjs';

const secret = 'test-only-secret-with-at-least-32-characters';
const camera = `cam_${'a'.repeat(32)}`;
const other = `cam_${'b'.repeat(32)}`;
function ticket(scope, deviceId = camera, now = Date.now()) {
  const encoded = Buffer.from(JSON.stringify({ v: 1, deviceId, scope, exp: Math.floor(now / 1000) + 300 })).toString('base64url');
  return `${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`;
}
test('tickets reject tampering, wrong role, invalid IDs and expiry', () => {
  const now = Date.now();
  const valid = ticket('view', camera, now);
  assert.equal(verifyTicket(valid, secret, 'view', now).deviceId, camera);
  assert.equal(verifyTicket(valid, secret, 'publish', now), null);
  assert.equal(verifyTicket(valid + 'x', secret, 'view', now), null);
  assert.equal(verifyTicket(valid, secret, 'view', now + 301000), null);
  assert.equal(verifyTicket(ticket('view', '../users/other'), secret, 'view'), null);
});

test('authenticated camera frames travel only to their owner; stale frames are cleared', async t => {
  let now = Date.now();
  const server = createRelay({ secret, origins: ['https://app.example.com'], now: () => now });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const publish = { Authorization: `Bearer ${ticket('publish', camera, now)}` };
  const view = `/v1/frame?ticket=${ticket('view', camera, now)}`;
  const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
  assert.equal((await fetch(base + '/v1/frame')).status, 401);
  assert.equal((await fetch(base + '/v1/demand', { headers: publish })).status, 204);
  assert.equal((await fetch(base + view, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(base + view)).status, 204);
  assert.equal((await fetch(base + '/v1/demand', { headers: publish })).status, 200);
  assert.equal((await fetch(base + '/v1/frame', { method: 'POST', headers: { ...publish, 'Content-Type': 'image/jpeg' }, body: jpeg })).status, 204);
  const frame = await fetch(base + view, { headers: { Origin: 'https://app.example.com' } });
  assert.equal(frame.headers.get('access-control-allow-origin'), 'https://app.example.com');
  assert.equal(frame.headers.get('cache-control'), 'no-store, private');
  assert.deepEqual(Buffer.from(await frame.arrayBuffer()), jpeg);
  assert.equal((await fetch(base + `/v1/frame?ticket=${ticket('view', other, now)}`)).status, 204);
  assert.equal((await fetch(base + '/v1/frame', { method: 'POST', headers: { Authorization: `Bearer ${ticket('view', camera, now)}`, 'Content-Type': 'image/jpeg' }, body: jpeg })).status, 401);
  now += 5000;
  assert.equal((await fetch(base + view)).status, 204, 'must not display an old frame as live');
  const bad = await fetch(base + '/v1/frame', { method: 'POST', headers: { ...publish, 'Content-Type': 'image/jpeg' }, body: 'not-a-jpeg' });
  assert.equal(bad.status, 400);
  assert.equal((await fetch(base + '/v1/frame', { method: 'POST', headers: { ...publish, 'Content-Type': 'image/jpeg' }, body: Buffer.alloc(256 * 1024 + 1) })).status, 413);
  now += 11000;
  assert.equal((await fetch(base + '/v1/demand', { headers: publish })).status, 204, 'upload stops when nobody is viewing');
  now += 300000;
  assert.equal((await fetch(base + view)).status, 401);
});

test('relay enforces bounded device capacity', async t => {
  const server = createRelay({ secret, maxDevices: 1 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/v1/frame?ticket=`;
  assert.equal((await fetch(base + ticket('view'))).status, 204);
  assert.equal((await fetch(base + ticket('view', other))).status, 503);
});
