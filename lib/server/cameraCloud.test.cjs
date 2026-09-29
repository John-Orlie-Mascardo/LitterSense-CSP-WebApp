const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

function load(file, imports) {
  const source = readFileSync(path.join(__dirname, file), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const sandboxModule = { exports: {} };
  vm.runInNewContext(outputText, { module: sandboxModule, exports: sandboxModule.exports, Buffer, URL, Response, Date, process,
    require: name => { if (!(name in imports)) throw Error(`Unexpected import ${name}`); return imports[name]; },
  });
  return sandboxModule.exports;
}

const deviceId = `cam_${'a'.repeat(32)}`;
const secret = 'test-relay-secret-at-least-32-characters';
const docs = new Map();
const admin = {
  getAdminAuth: () => ({ verifyIdToken: async (value, revoked) => {
    assert.equal(revoked, true);
    if (value !== 'owner-token') throw Error('Invalid token');
    return { uid: 'owner' };
  } }),
  getAdminFirestore: () => ({ doc: name => ({ get: async () => ({ data: () => docs.get(name) }), update: async value => docs.set(name, { ...docs.get(name), ...value }) }) }),
};
const cloud = load('cameraCloud.ts', { 'node:crypto': crypto, '@/lib/configs/firebase-admin': admin });

test('key validation and ticket scope/expiry are bound to one camera', () => {
  const key = 'b'.repeat(64);
  assert.equal(cloud.matchesCameraKey(key, cloud.cameraKeyHash(key)), true);
  assert.equal(cloud.matchesCameraKey('c'.repeat(64), cloud.cameraKeyHash(key)), false);
  assert.equal(cloud.matchesCameraKey('', undefined), false);
  const [payload, signature] = cloud.cameraTicket(deviceId, 'view', secret, 1700000000000).split('.');
  assert.equal(signature, crypto.createHmac('sha256', secret).update(payload).digest('base64url'));
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), { v: 1, deviceId, scope: 'view', exp: 1700000300 });
});

test('view endpoint requires authentication and checks camera ownership and revocation', async () => {
  process.env.CAMERA_RELAY_URL = 'https://relay.example.com';
  process.env.CAMERA_RELAY_SECRET = secret;
  docs.clear();
  const route = load('../../app/api/camera/session/route.ts', { '@/lib/server/cameraCloud': cloud });
  assert.equal((await route.GET(new Request('https://app.example.com/api/camera/session'))).status, 401);
  const request = () => new Request('https://app.example.com/api/camera/session', { headers: { Authorization: 'Bearer owner-token' } });
  assert.equal((await route.GET(request())).status, 404);
  docs.set('users/owner/deviceState/camera', { deviceId });
  docs.set(`cameraDevices/${deviceId}`, { ownerId: 'someone-else' });
  assert.equal((await route.GET(request())).status, 404);
  docs.set(`cameraDevices/${deviceId}`, { ownerId: 'owner', revoked: true });
  assert.equal((await route.GET(request())).status, 404);
  docs.set(`cameraDevices/${deviceId}`, { ownerId: 'owner', revoked: false });
  const response = await route.GET(request());
  assert.equal(response.status, 200);
  assert.match((await response.json()).frameUrl, /^https:\/\/relay.example.com\/v1\/frame\?ticket=/);
  assert.equal(response.headers.get('cache-control'), 'no-store, private');
});

test('device session accepts only its private key and never issues a view ticket', async () => {
  const key = 'b'.repeat(64);
  docs.set(`cameraDevices/${deviceId}`, { ownerId: 'owner', keyHash: cloud.cameraKeyHash(key), revoked: false });
  const route = load('../../app/api/camera/device-session/route.ts', { '@/lib/server/cameraCloud': cloud, '@/lib/configs/firebase-admin': admin });
  const request = (value = key) => new Request('https://app.example.com/api/camera/device-session', { method: 'POST', headers: { Authorization: `Bearer ${value}`, 'x-camera-id': deviceId } });
  assert.equal((await route.POST(request('wrong'))).status, 401);
  const response = await route.POST(request());
  assert.equal(response.status, 200);
  const claim = JSON.parse(Buffer.from(response.headers.get('x-camera-ticket').split('.')[0], 'base64url'));
  assert.equal(claim.scope, 'publish');
  docs.set(`cameraDevices/${deviceId}`, { ownerId: 'owner', keyHash: cloud.cameraKeyHash(key), revoked: true });
  assert.equal((await route.POST(request())).status, 401);
});
