import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

test('history endpoint binds verified owner and rejects changed/foreign cursors without leaking rows', async () => {
  const loaded = { exports: {} }; let ownerRead = '';
  class HistoryReadError extends Error { constructor(message, status, resetRequired = false) { super(message); this.status = status; this.resetRequired = resetRequired; } }
  const imports = {
    '@/lib/configs/firebase-admin': { getAdminAuth: () => ({ verifyIdToken: async (token, revoked) => { assert.equal(revoked, true); if (token !== 'good') throw Error(); return { uid: 'owner-a' }; } }) },
    '@/lib/utils/catHistoryReads': { HistoryReadError, readCatHistory: async (owner, query) => { ownerRead = owner; if (query.cursor === 'stale') throw new HistoryReadError('History source changed', 409, true); return { rows: [], nextCursor: null, source: 'firebase', complete: true, pendingCount: 0 }; } },
    '@/lib/presentation/sessionHistory': { HISTORY_BATCH_SIZE: 20 },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: loaded, exports: loaded.exports, require: name => imports[name], Response, Request, URL, URLSearchParams, process });
  const url = suffix => new Request(`https://test/api/cat-history?startDate=2026-10-01&endDate=2026-10-31${suffix}`, { headers: { Authorization: 'Bearer good' } });
  assert.equal((await loaded.exports.GET(new Request('https://test/api/cat-history'))).status, 401);
  const success = await loaded.exports.GET(url('&ownerId=owner-b')); assert.equal(success.status, 200); assert.equal(ownerRead, 'owner-a');
  const stale = await loaded.exports.GET(url('&cursor=stale')); assert.equal(stale.status, 409); assert.equal((await stale.json()).resetRequired, true);
});
