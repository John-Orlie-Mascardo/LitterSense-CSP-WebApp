import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

test('sync authenticates owner and does not start history copying without a complete stored catalog', async () => {
  const calls = [];
  let failMirror = false;
  const loaded = { exports: {} };
  const imports = {
    '@/lib/configs/firebase-admin': { getAdminAuth: () => ({ verifyIdToken: async (token, revoked) => { assert.equal(revoked, true); if (token !== 'good') throw new Error(); return { uid: 'owner-a' }; } }) },
    '@/lib/utils/catCatalogSync': { captureCatalog: async owner => { calls.push(`capture:${owner}`); return { complete: true, revision: 1, profiles: [] }; } },
    '@/lib/utils/catHistoryStore': { saveCatalogBackup: async owner => { calls.push(`store:${owner}`); if (failMirror) throw new Error(); } },
    '@/lib/utils/catHistoryBackfill': { copyHistoryPage: async owner => { calls.push(`copy:${owner}`); return { scanned: 100, complete: false }; } },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: loaded, exports: loaded.exports, require: name => imports[name], Response });
  const request = token => new Request('https://test/api/cat-backup/sync', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ ownerId: 'owner-b' }) });
  assert.equal((await loaded.exports.POST(request('bad'))).status, 401);
  assert.equal(calls.length, 0);
  const response = await loaded.exports.POST(request('good'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).scanned, 100);
  assert.deepEqual(calls, ['capture:owner-a', 'store:owner-a', 'copy:owner-a']);
  calls.length = 0; failMirror = true;
  assert.equal((await loaded.exports.POST(request('good'))).status, 503);
  assert.equal(calls.some(call => call.startsWith('copy:')), false);
});
