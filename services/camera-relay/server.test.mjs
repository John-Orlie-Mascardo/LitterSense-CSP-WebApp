import test from 'node:test';
import { WebSocket } from 'ws';
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
  const upload = await fetch(base + '/v1/frame', { method: 'POST', headers: { ...publish, 'Content-Type': 'image/jpeg' }, body: jpeg });
  assert.equal(upload.status, 204);
  assert.equal(upload.headers.get('x-viewer-active'), '1');
  const frame = await fetch(base + view, { headers: { Origin: 'https://app.example.com' } });
  assert.equal(frame.headers.get('access-control-allow-origin'), 'https://app.example.com');
  assert.equal(frame.headers.get('cache-control'), 'no-store, private');
  assert.equal(frame.headers.get('x-frame-at'), String(now));
  assert.equal(frame.headers.get('x-frame-age-ms'), '0');
  assert.equal(frame.headers.get('access-control-expose-headers'), 'X-Frame-At, X-Frame-Age-Ms');
  assert.deepEqual(Buffer.from(await frame.arrayBuffer()), jpeg);
  assert.equal((await fetch(base + `/v1/frame?ticket=${ticket('view', other, now)}`)).status, 204);
  assert.equal((await fetch(base + '/v1/frame', { method: 'POST', headers: { Authorization: `Bearer ${ticket('view', camera, now)}`, 'Content-Type': 'image/jpeg' }, body: jpeg })).status, 401);
  now += 2500;
  assert.equal((await fetch(base + view)).status, 204, 'must not display an old frame as live');
  const bad = await fetch(base + '/v1/frame', { method: 'POST', headers: { ...publish, 'Content-Type': 'image/jpeg' }, body: 'not-a-jpeg' });
  assert.equal(bad.status, 400);
  assert.equal((await fetch(base + '/v1/frame', { method: 'POST', headers: { ...publish, 'Content-Type': 'image/jpeg' }, body: Buffer.alloc(256 * 1024 + 1) })).status, 413);
  now += 11000;
  assert.equal((await fetch(base + '/v1/demand', { headers: publish })).status, 204, 'upload stops when nobody is viewing');
  const idleUpload = await fetch(base + '/v1/frame', { method: 'POST', headers: { ...publish, 'Content-Type': 'image/jpeg' }, body: jpeg });
  assert.equal(idleUpload.status, 204);
  assert.equal(idleUpload.headers.get('x-viewer-active'), '0');
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

async function connectSocket(url, options = {}) {
  const ws = new WebSocket(url, options);
  const messages = [];
  ws.on('message', (data, binary) => messages.push({ data, binary }));
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  async function next() {
    const until = Date.now() + 2000;
    while (!messages.length && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(messages.length, 'expected a WebSocket message');
    return messages.shift();
  }
  return { ws, messages, next };
}
async function rejectedSocket(url, options, status) {
  const ws = new WebSocket(url, options);
  ws.on('error', () => {});
  await new Promise((resolve, reject) => {
    ws.once('unexpected-response', (_req, res) => { assert.equal(res.statusCode, status); res.resume(); ws.terminate(); resolve(); });
    ws.once('open', () => { ws.terminate(); reject(new Error('unauthorized socket opened')); });
  });
}
test('WebSocket auth, viewer demand and latest-frame delivery stay bounded and private', async t => {
  let now = Date.now();
  const server = createRelay({ secret, origins: ['https://app.example.com'], now: () => now });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const connections = [];
  t.after(() => { for (const ws of connections) ws.terminate(); server.closeAllConnections(); server.close(); });
  const base = `ws://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${ticket('publish', camera, now)}` };
  const viewUrl = `${base}/v1/live?ticket=${ticket('view', camera, now)}`;
  const viewerOptions = { origin: 'https://app.example.com' };
  await rejectedSocket(base + '/v1/publish', {}, 401);
  await rejectedSocket(viewUrl, { origin: 'https://evil.example.com' }, 403);
  await rejectedSocket(viewUrl, {}, 403);
  await rejectedSocket(base + '/v1/publish', { headers: { Authorization: `Bearer ${ticket('view', camera, now)}` } }, 401);
  const publisher = await connectSocket(base + '/v1/publish', { headers });
  connections.push(publisher.ws);
  assert.equal((await publisher.next()).data.toString(), '0');
  await rejectedSocket(base + '/v1/publish', { headers }, 409);
  const viewer = await connectSocket(viewUrl, viewerOptions);
  connections.push(viewer.ws);
  assert.equal((await publisher.next()).data.toString(), '1');
  const jpeg = n => Buffer.from([0xff, 0xd8, n, 0xff, 0xd9]);
  publisher.ws.send(jpeg(1));
  assert.equal((await publisher.next()).data.toString(), 'a');
  const first = await viewer.next();
  assert.equal(first.binary, true);
  assert.equal(Number(first.data.readBigUInt64BE()), now);
  assert.deepEqual(first.data.subarray(8), jpeg(1));
  now += 200;
  publisher.ws.send(jpeg(2));
  await publisher.next();
  now += 200;
  publisher.ws.send(jpeg(3));
  await publisher.next();
  assert.equal(viewer.messages.length, 0, 'unacknowledged viewer must not accumulate a frame queue');
  viewer.ws.send('ready');
  assert.deepEqual((await viewer.next()).data.subarray(8), jpeg(3), 'slow viewer receives only newest frame');
  const unrelated = await connectSocket(`${base}/v1/live?ticket=${ticket('view', other, now)}`, viewerOptions);
  connections.push(unrelated.ws);
  assert.equal(unrelated.messages.length, 0);
  viewer.ws.close();
  assert.equal((await publisher.next()).data.toString(), '0');
  const closed = new Promise(resolve => publisher.ws.once('close', resolve));
  now += 301000;
  publisher.ws.send(jpeg(4));
  assert.equal(await closed, 1008, 'expired publisher must stop transmitting');
});
