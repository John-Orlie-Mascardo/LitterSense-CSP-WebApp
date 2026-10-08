import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

test('notification stream handles split frames, renews and stops without later callbacks', async () => {
  let changed = 0, catalogChanged = 0, visitsChanged = 0, scheduled, calls = 0;
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync('lib/utils/notificationLive.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module: { exports }, exports, AbortController, AbortSignal, TextDecoder,
    setTimeout: (fn, delay) => { scheduled = { fn, delay }; return 1; }, clearTimeout: () => { scheduled = null; },
    fetch: async (_, options) => {
      assert.equal(options.headers.Authorization, 'Bearer owner-token'); calls++;
      return new Response(new ReadableStream({ start(c) { for (const part of ['data: cha', 'nged\n\ndata: changed\n', '\ndata: cats\n\ndata: visits\n\n']) c.enqueue(new TextEncoder().encode(part)); c.close(); } }));
    },
  });
  const stopCatalog = exports.subscribeCatCatalogChanges(() => catalogChanged++);
  const stopVisits = exports.subscribeCatVisitChanges(() => visitsChanged++);
  const stop = exports.subscribeNotificationLive(async () => 'owner-token', () => changed++);
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(changed, 2); assert.equal(calls, 1); assert.equal(scheduled.delay, 250);
  assert.equal(catalogChanged, 1);
  assert.equal(visitsChanged, 1);
  stop(); stopCatalog(); stopVisits(); assert.equal(scheduled, null);
});

test('empty successful HTTP streams back off instead of reconnecting repeatedly', async () => {
  let scheduled;
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync('lib/utils/notificationLive.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module: { exports }, exports, AbortController, AbortSignal, TextDecoder,
    setTimeout: (fn, delay) => { scheduled = { fn, delay }; return 1; }, clearTimeout: () => {},
    fetch: async () => new Response(new ReadableStream({ start(c) { c.close(); } })),
  });
  const stop = exports.subscribeNotificationLive(async () => 'owner-token', () => assert.fail('No invalidation arrived'));
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(scheduled.delay, 2000);
  await scheduled.fn();
  assert.equal(scheduled.delay, 4000);
  stop();
});
