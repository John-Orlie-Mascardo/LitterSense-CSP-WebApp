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

test('confirmed catalog writes show immediately without discarding visits or other cat details', () => {
  const { applyConfirmedCatProfile } = load();
  const original = { ownerId: 'owner-a', visits: [{ sessionId: 'visit' }], catalog: { revision: 1, profiles: [{ catId: 'existing', cat: { name: 'Existing' }, details: { breed: 'Puspin', baseline: { avgVisitsPerDay: 2, avgDurationSecs: 30 } } }] } };
  const added = applyConfirmedCatProfile(original, { action: 'create', catId: 'new', cat: { name: 'New' }, details: { rfidTag: 'AABB' } }, 2);
  assert.equal(added.catalog.profiles.length, 2); assert.equal(added.catalog.profiles[1].cat.name, 'New');
  assert.equal(added.visits, original.visits); assert.equal(original.catalog.profiles.length, 1);
  const edited = applyConfirmedCatProfile(added, { action: 'update', catId: 'existing', details: { baseline: { avgVisitsPerDay: 3 } } }, 3);
  assert.equal(edited.catalog.profiles[0].details.baseline.avgDurationSecs, 30);
  assert.equal(edited.catalog.profiles[0].details.breed, 'Puspin');
  const removed = applyConfirmedCatProfile(edited, { action: 'delete', catId: 'new' }, 4);
  assert.equal(removed.catalog.profiles.length, 1); assert.equal(removed.catalog.revision, 4);
});

test('publishes cat profiles while history is still waiting, then completes the same owner snapshot', async () => {
  const { fetchCatBackupSnapshot } = load();
  let finishHistory;
  const history = new Promise(resolve => { finishHistory = resolve; });
  const published = [];
  const response = value => ({ ok: true, status: 200, json: async () => value });
  const result = fetchCatBackupSnapshot({ uid: 'owner-a', getIdToken: async () => 'token' }, new AbortController().signal,
    async url => url === '/api/cats'
      ? response({ profiles: [{ catId: 'cat-a', cat: { name: 'Cat' }, details: {} }], source: 'supabase', operationalPrimary: true, complete: true, revision: 1 })
      : history,
    snapshot => published.push(snapshot));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(published.length, 1, 'catalog must reach the UI before the history request finishes');
  assert.equal(published[0].ownerId, 'owner-a');
  assert.equal(published[0].catalog.profiles[0].cat.name, 'Cat');
  assert.equal(published[0].historyLoading, true);
  assert.equal(published[0].complete, false);
  finishHistory(response({ rows: [{ sessionId: 'visit-a' }], source: 'supabase', complete: true, pendingCount: 0, nextCursor: null }));
  const final = await result;
  assert.equal(final.historyLoading, false);
  assert.equal(final.complete, true);
  assert.equal(final.visits[0].sessionId, 'visit-a');
});

test('startup requests larger bounded history batches without changing the normal history page size', async () => {
  const { fetchCatBackupSnapshot } = load();
  const response = value => ({ ok: true, status: 200, json: async () => value });
  await fetchCatBackupSnapshot({ uid: 'owner', getIdToken: async () => 'token' }, new AbortController().signal, async url => {
    if (url === '/api/cats') return response({ profiles: [], source: 'supabase', complete: true });
    assert.equal(new URLSearchParams(url.split('?')[1]).get('limit'), '100');
    return response({ rows: [], source: 'supabase', complete: true, pendingCount: 0, nextCursor: null });
  });
});

test('catalog refresh keeps displayed visits and newer confirmed profile edits until new history finishes', () => {
  const { mergeCatBackupProgress } = load();
  const previous = { ownerId: 'owner-a', catalog: { revision: 4, profiles: [{ catId: 'new-cat' }], complete: true }, historySource: 'supabase', visits: [{ sessionId: 'visible-entry' }], complete: true, historyLoading: false, pendingCount: 0, truncated: false };
  const progress = { ownerId: 'owner-a', catalog: { revision: 3, profiles: [], complete: true }, historySource: 'supabase', visits: [], complete: false, historyLoading: true, pendingCount: 0, truncated: false };
  const merged = mergeCatBackupProgress(previous, progress);
  assert.equal(merged.visits, previous.visits);
  assert.equal(merged.catalog, previous.catalog);
  assert.equal(merged.historyLoading, false, 'a background refresh must not hide the existing history');
  assert.equal(merged.complete, true);
  const anotherOwner = mergeCatBackupProgress(previous, { ...progress, ownerId: 'owner-b' });
  assert.equal(anotherOwner.ownerId, 'owner-b');
  assert.equal(anotherOwner.visits.length, 0, 'account switches must never retain another owner history');
  assert.equal(anotherOwner.historyLoading, true);
});

test('failed history reads retain the published catalog but never mark history loaded', async () => {
  const { fetchCatBackupSnapshot } = load();
  let published;
  await assert.rejects(fetchCatBackupSnapshot({ uid: 'owner', getIdToken: async () => 'token' }, new AbortController().signal,
    async url => url === '/api/cats'
      ? { ok: true, json: async () => ({ profiles: [{ catId: 'cat-a' }], source: 'supabase', complete: true }) }
      : { ok: false, status: 503 },
    snapshot => { published = snapshot; }), /Cat history is unavailable/);
  assert.equal(published.catalog.profiles[0].catId, 'cat-a');
  assert.equal(published.historyLoading, true);
  assert.equal(published.complete, false);
});

test('aborted owner fetch never publishes a late catalog', async () => {
  const { fetchCatBackupSnapshot } = load();
  const controller = new AbortController();
  let finishCatalog;
  const catalog = new Promise(resolve => { finishCatalog = resolve; });
  const published = [];
  const result = fetchCatBackupSnapshot({ uid: 'old-owner', getIdToken: async () => 'token' }, controller.signal, async () => catalog, snapshot => published.push(snapshot));
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  finishCatalog({ ok: true, json: async () => ({ profiles: [], source: 'supabase', complete: true }) });
  await assert.rejects(result, error => error.name === 'AbortError');
  assert.equal(published.length, 0);
});
