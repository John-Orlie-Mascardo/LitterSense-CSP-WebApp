import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('real saved alerts still queue once; removed test requests cannot send', async () => {
  const records = []; const keys = new Set(); let afterCalls = 0, source = 'system';
  const imports = {
    '@/lib/server/operationalStore': { rfidPrimaryEnabled: () => false },
    'next/server': { after: () => { afterCalls++; } },
    '@/lib/configs/firebase-admin': {
      getAdminAuth: () => ({ verifyIdToken: async () => ({ uid: 'owner' }) }),
      getAdminFirestore: () => ({ doc: path => {
        assert.equal(path, 'users/owner/notifications/alert-1');
        return { get: async () => ({ exists: true, data: () => ({ source, catId: 'cat-1', title: 'Device alert', message: 'Check the device.', createdAt: { toMillis: () => Date.now() } }) }) };
      } }),
    },
    '@/lib/utils/pushDelivery': { processPushOutbox: async () => {} },
    '@/lib/utils/smsAccountSync': { smsStoreRequest: async (path, init) => {
      const record = JSON.parse(init.body); records.push(record);
      if (keys.has(record.event_key)) return Response.json([]);
      keys.add(record.event_key); return Response.json([record]);
    } },
  };
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: loaded, exports: loaded.exports, require: name => imports[name], Response, Date });
  const request = body => new Request('https://test/api/push/dispatch', { method: 'POST', headers: { Authorization: 'Bearer good', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await loaded.exports.POST(request({ test: true, token: 'old-device' }))).status, 400);
  assert.equal(records.length, 0);
  assert.deepEqual(await (await loaded.exports.POST(request({ notificationId: 'alert-1' }))).json(), { queued: true });
  assert.equal(records[0].context.title, 'Device alert');
  assert.equal(records[0].push_status, 'pending');
  assert.deepEqual(await (await loaded.exports.POST(request({ notificationId: 'alert-1' }))).json(), { queued: false });
  assert.equal(afterCalls, 1);
  source = 'dashboard_abnormal'; keys.clear();
  assert.deepEqual(await (await loaded.exports.POST(request({ notificationId: 'alert-1' }))).json(), { queued: true });
  assert.equal(records.at(-1).context.source, 'dashboard_abnormal');
  assert.equal(records.at(-1).cat_id, 'cat-1');
  source = 'h2s_alert';
  assert.deepEqual(await (await loaded.exports.POST(request({ notificationId: 'alert-1' }))).json(), { queued: false });
});
