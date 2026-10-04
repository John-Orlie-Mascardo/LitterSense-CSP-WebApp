import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';

function load(file, imports) {
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: loaded, exports: loaded.exports, require: name => imports[name], Date, Buffer });
  return loaded.exports;
}
function fixture(count) {
  const docs = Array.from({ length: count }, (_, i) => ({ id: `exact-${String(i).padStart(5, '0')}`, data: () => ({ catId: 'cat-a', durationSecs: i % 2 ? 1 : 32, date: i === 0 ? undefined : '2026-10-04', sessionStatus: i % 2 ? 'SHORT_SESSION' : 'NORMAL' }) }));
  const stored = new Map();
  let progress = null, failStore = false, failProgress = false, counterWrites = 0;
  const query = (cursor = '', limit = 100) => ({ orderBy: () => query(cursor, limit), startAfter: next => query(next, limit), limit: n => query(cursor, n), get: async () => ({ docs: docs.filter(d => d.id > cursor).slice(0, limit) }) });
  const imports = {
    '@/lib/configs/firebase-admin': { getAdminFirestore: () => ({ collection: path => { assert.equal(path, 'users/owner-a/sessions'); return query(); }, runTransaction: () => { counterWrites++; throw new Error('Import must not write primary'); } }) },
    'firebase-admin/firestore': { FieldPath: { documentId: () => '__name__' } },
    './catHistoryNormalization': load('./catHistoryNormalization.ts', { 'node:crypto': crypto }),
    './sessionDate': { toIsoStringFromDateLike: value => new Date(value.toDate ? value.toDate() : value).toISOString() },
    './catHistoryStore': {
      readBackupProgress: async () => progress,
      saveBackupProgress: async (_owner, value) => { if (failProgress) { failProgress = false; throw new Error('Progress unavailable'); } progress = value; },
      saveVisitBackups: async (owner, rows) => { assert.equal(owner, 'owner-a'); assert.ok(rows.length <= 100); if (failStore) { failStore = false; throw new Error('Storage unavailable'); } rows.forEach(row => { assert.equal(row.state, 'primary_saved'); stored.set(row.sessionId, row); }); return { inserted: rows.length, duplicates: 0, conflicts: 0 }; },
    },
  };
  const helper = load('./catHistoryBackfill.ts', imports);
  return { helper, stored, docs, get progress() { return progress; }, get counterWrites() { return counterWrites; }, failStore: () => { failStore = true; }, failProgress: () => { failProgress = true; } };
}
test('backfill1201SessionsWithoutTruncation; importDoesNotIncrementPrimaryCounters', async () => {
  const f = fixture(1201);
  for (let page = 0; page < 20 && !f.progress?.complete; page++) await f.helper.copyHistoryPage('owner-a');
  assert.equal(f.progress.complete, true);
  assert.equal(f.progress.scanned, 1201);
  assert.equal(f.stored.size, 1201);
  assert.equal(f.counterWrites, 0);
  assert.equal(f.stored.get('exact-00000').data.date, '');
  assert.equal(f.stored.get('exact-00001').data.durationSecs, 1);
  assert.deepEqual([...f.stored.keys()], f.docs.map(d => d.id));
  // Completed rolling repair starts at the beginning; late early-ID inserts are eventually copied.
  f.docs.unshift({ id: 'before-cursor', data: () => ({ catId: 'cat-a', durationSecs: 1 }) });
  await f.helper.copyHistoryPage('owner-a');
  assert.equal(f.progress.complete, false);
  assert.equal(f.progress.scanned, 100);
  assert.equal(f.stored.has('before-cursor'), true);
});
test('restartDoesNotSkipUnstoredPage or a stored page whose progress response was lost', async () => {
  const f = fixture(201);
  await f.helper.copyHistoryPage('owner-a');
  const previous = f.progress.cursor;
  f.failStore();
  const failed = await f.helper.copyHistoryPage('owner-a');
  assert.equal(failed.cursor, previous);
  assert.equal(failed.scanned, 100);
  assert.equal(failed.complete, false);
  assert.ok(failed.lastError);
  f.failProgress();
  await assert.rejects(f.helper.copyHistoryPage('owner-a'));
  assert.equal(f.progress.cursor, previous);
  await f.helper.copyHistoryPage('owner-a');
  await f.helper.copyHistoryPage('owner-a');
  assert.equal(f.progress.complete, true);
  assert.equal(f.progress.scanned, 201);
  assert.equal(f.stored.size, 201);
});
test('unsupported rows report incomplete and do not advance the cursor', async () => {
  const f = fixture(1);
  f.docs[0].data = () => ({ catId: 'cat-a', durationSecs: 2, unsupported: true });
  const result = await f.helper.copyHistoryPage('owner-a');
  assert.equal(result.complete, false);
  assert.equal(result.scanned, 0);
  assert.equal(result.cursor, null);
  assert.ok(result.lastError);
  assert.equal(f.stored.size, 0);
});
test('a full 100-row page is not completion; legacy timestamps retain their original times', async () => {
  const f = fixture(100);
  f.docs[0].data = () => ({ catId: 'cat-a', durationSecs: 32, date: '2026-10-04', endedAt: { toDate: () => new Date('2026-10-04T08:00:32Z') } });
  await f.helper.copyHistoryPage('owner-a');
  assert.equal(f.progress.complete, false);
  assert.equal(f.stored.get('exact-00000').data.endedAt, '2026-10-04T08:00:32Z');
  await f.helper.copyHistoryPage('owner-a');
  assert.equal(f.progress.complete, true);
  assert.equal(f.progress.scanned, 100);
});
