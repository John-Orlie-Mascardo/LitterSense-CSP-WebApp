import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

test('live route authenticates the owner, exposes only invalidations and closes resources on abort', async () => {
  const exports = {}; let changed, watchedOwner, stopped = false;
  vm.runInNewContext(ts.transpileModule(readFileSync('app/api/notifications/live/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module: { exports }, exports, Response, ReadableStream, TextEncoder,
    setTimeout: () => 1, clearTimeout: () => {},
    require: name => name.includes('firebase-admin') ? { getAdminAuth: () => ({ verifyIdToken: async token => { if (token !== 'valid') throw new Error(); return { uid: 'owner' }; } }) }
      : name.includes('operationalStore') ? { rfidPrimaryEnabled: () => true }
      : { watchNotificationChanges: (uid, callback) => { watchedOwner = uid; changed = callback; return () => { stopped = true; }; } },
  });
  assert.equal((await exports.GET(new Request('https://test/api/notifications/live'))).status, 401);
  const controller = new AbortController();
  const response = await exports.GET(new Request('https://test/api/notifications/live?owner=other', { headers: { Authorization: 'Bearer valid' }, signal: controller.signal }));
  assert.equal(watchedOwner, 'owner');
  const reader = response.body.getReader(); changed();
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'data: changed\n\n');
  controller.abort(); assert.equal(stopped, true); assert.equal((await reader.read()).done, true);
});
