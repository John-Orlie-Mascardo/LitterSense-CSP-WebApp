import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function load() {
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./useCatBackup.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: loaded, exports: loaded.exports, require: name => name === 'react' ? { useEffect: () => {}, useState: () => [null, () => {}], useRef: value => ({ current: value }), useCallback: fn => fn } : { useAuth: () => ({}) }, Date, URLSearchParams, fetch: () => {}, AbortController, setTimeout, clearTimeout, document: { hidden: false } });
  return loaded.exports;
}

test('loads every bounded backup page and retains owner identity with no duplicate visits', async () => {
  const { fetchCatBackupSnapshot } = load(); let pages = 0;
  const response = value => ({ ok: true, status: 200, json: async () => value });
  const fetcher = async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer token-a');
    if (url === '/api/cats') return response({ profiles: [{ catId: 'cat-a', cat: { name: 'Cat' }, details: {} }], complete: true, source: 'supabase', backupPending: false, revision: 1 });
    pages++; const cursor = new URLSearchParams(url.split('?')[1]).get('cursor');
    const base = cursor ? Number(cursor) : 0;
    return response({ rows: Array.from({ length: 20 }, (_, i) => ({ sessionId: `id-${base + i}`, catId: 'cat-a', data: { date: '2026-10-04', durationSecs: 32 }, state: 'pending' })), nextCursor: pages < 11 ? String(base + 20) : null, complete: true, source: 'supabase', pendingCount: 1 });
  };
  const snapshot = await fetchCatBackupSnapshot({ uid: 'owner-a', getIdToken: async () => 'token-a' }, new AbortController().signal, fetcher);
  assert.equal(snapshot.ownerId, 'owner-a'); assert.equal(snapshot.visits.length, 220); assert.equal(new Set(snapshot.visits.map(row => row.sessionId)).size, 220); assert.equal(pages, 11);
});

test('source reset retries from start and owner switch cannot reuse old results', async () => {
  const { fetchCatBackupSnapshot } = load(); let changed = false;
  const fetcher = async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer token-b');
    if (url === '/api/cats') return { ok: true, json: async () => ({ profiles: [], complete: false, source: 'supabase', backupPending: true }) };
    const cursor = new URLSearchParams(url.split('?')[1]).get('cursor');
    if (cursor && !changed) { changed = true; return { ok: false, status: 409, json: async () => ({ resetRequired: true }) }; }
    return { ok: true, status: 200, json: async () => ({ rows: [{ sessionId: 'owner-b-only', catId: 'cat-b', data: { date: '2026-10-04', durationSecs: 1 } }], nextCursor: changed ? null : 'next', source: 'supabase', complete: false, pendingCount: 1 }) };
  };
  const result = await fetchCatBackupSnapshot({ uid: 'owner-b', getIdToken: async () => 'token-b' }, new AbortController().signal, fetcher);
  assert.equal(result.ownerId, 'owner-b'); assert.equal(result.visits.length, 1); assert.equal(result.visits[0].sessionId, 'owner-b-only'); assert.equal(result.catalog.complete, false);
});

test('healthy reads stop after status page and never query sensor endpoints', async () => {
  const { fetchCatBackupSnapshot } = load(); const urls = [];
  const fetcher = async url => { urls.push(url); return { ok: true, status: 200, json: async () => url === '/api/cats' ? { profiles: [], source: 'firebase', complete: true } : { rows: [{ sessionId: 'primary-only' }], source: 'firebase', pendingCount: 0, complete: true, nextCursor: 'not-needed' } }; };
  const result = await fetchCatBackupSnapshot({ uid: 'owner-a', getIdToken: async () => 'token-a' }, new AbortController().signal, fetcher);
  assert.equal(result.visits.length, 0); assert.equal(urls.length, 2); assert.ok(urls.every(url => !url.includes('sensors')));
});
