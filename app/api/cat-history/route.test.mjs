import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function historyBatchFixture() {
  const queries = [];
  const loaded = { exports: {} };
  const imports = {
    '@/lib/configs/firebase-admin': { getAdminAuth: () => ({ verifyIdToken: async token => {
      if (token !== 'good') throw Error('Unauthorized');
      return { uid: 'owner-a' };
    } }) },
    '@/lib/utils/catHistoryReads': { HistoryReadError: class extends Error {}, readCatHistory: async (owner, query) => {
      queries.push({ owner, query });
      return { rows: [], nextCursor: null, source: 'supabase', complete: true, pendingCount: 0 };
    } },
    '@/lib/presentation/sessionHistory': { HISTORY_BATCH_SIZE: 20 },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: loaded, exports: loaded.exports, require: name => imports[name], Response, Request, URL, URLSearchParams, process });
  const request = (suffix = '', token = 'good') => new Request(`https://test/api/cat-history?startDate=2026-10-01&endDate=2026-10-31${suffix}`, { headers: { Authorization: `Bearer ${token}` } });
  return { GET: loaded.exports.GET, queries, request };
}

test('history keeps its 20-row default and allows a bounded 100-row startup batch', async () => {
  const fixture = historyBatchFixture();
  assert.equal((await fixture.GET(fixture.request())).status, 200);
  assert.equal(fixture.queries[0].query.limit, 20);
  assert.equal((await fixture.GET(fixture.request('&limit=100&ownerId=owner-b'))).status, 200);
  assert.equal(fixture.queries[1].query.limit, 100);
  assert.equal(fixture.queries[1].owner, 'owner-a');
  assert.equal((await fixture.GET(fixture.request('&limit=1'))).status, 200);
  assert.equal(fixture.queries[2].query.limit, 1);
});

test('invalid batch sizes fail before a history read and still require authentication', async () => {
  const fixture = historyBatchFixture();
  for (const limit of ['', '0', '101', '-1', '1.5', '1e2', 'Infinity', 'abc']) {
    assert.equal((await fixture.GET(fixture.request(`&limit=${encodeURIComponent(limit)}`))).status, 400, `invalid limit ${limit}`);
  }
  assert.equal(fixture.queries.length, 0);
  assert.equal((await fixture.GET(fixture.request('&limit=101', 'bad'))).status, 401);
  assert.equal(fixture.queries.length, 0);
});

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
