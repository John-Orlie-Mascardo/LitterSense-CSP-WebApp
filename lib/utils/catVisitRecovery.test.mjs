import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';

function load(file, imports) {
  const loadedModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: loadedModule, exports: loadedModule.exports, require: name => { if (!(name in imports)) throw new Error(`Unexpected import ${name}`); return imports[name]; }, Date, Buffer, process, console });
  return loadedModule.exports;
}

function fixture() {
  const token = 'cfg_abcdefghijklmnop', hash = crypto.createHash('sha256').update(token).digest('hex');
  const docs = new Map([
    ['users/owner-a', { name: 'Owner' }], ['users/owner-a/cats/cat-a', { name: 'Cat' }],
    ['users/owner-a/deviceConfig/default', { configToken: token }], [`deviceConfigs/${token}`, { ownerId: 'owner-a' }],
  ]);
  let lost = false, unavailable = false, authFailure = null, finishFailure = false, leaseExpired = false, attempts = 0;
  const snapshot = path => { const data = docs.get(path); return { exists: docs.has(path), data: () => data }; };
  const db = { doc: path => ({ path, get: async () => snapshot(path) }), runTransaction: async (callback, options) => {
    assert.equal(options.maxAttempts, 3);
    // Optimistic fixture retries a callback when another transaction changes any read document.
    for (let attempt = 0; attempt < 3; attempt++) {
      attempts++;
      if (unavailable) throw Object.assign(new Error('Unavailable'), { code: 14 });
      const writes = [], reads = new Map(); let writing = false;
      const tx = { get: async ref => { assert.equal(writing, false); reads.set(ref.path, docs.get(ref.path)); return snapshot(ref.path); },
        create: (ref, data) => { writing = true; writes.push([ref.path, data, false]); },
        set: (ref, data) => { writing = true; writes.push([ref.path, data, true]); },
      };
      const result = await callback(tx);
      if ([...reads].some(([path, data]) => docs.get(path) !== data)) continue;
      for (const [path, data, merge] of writes) {
        if (!merge) assert.equal(docs.has(path), false);
        const next = { ...(merge ? docs.get(path) : {}), ...data };
        for (const [key, value] of Object.entries(data)) if (value?.increment !== undefined) next[key] = (typeof docs.get(path)?.[key] === 'number' ? docs.get(path)[key] : 0) + value.increment;
        docs.set(path, next);
      }
      if (lost) { lost = false; throw Object.assign(new Error('Lost response after commit'), { code: 14 }); }
      return result;
    }
    throw Object.assign(new Error('Contention'), { code: 10 });
  } };
  const normalization = load('./catHistoryNormalization.ts', { 'node:crypto': crypto });
  const sync = load('./sensorSync.ts', {});
  const ingestion = load('./catVisitIngestion.ts', { 'node:crypto': crypto, './catHistoryNormalization': normalization, './catHistoryStore': {}, './sensorSync': sync });
  const rows = new Map(), finishes = [], repairs = [], catalogSaves = [];
  const store = {
    claimPendingVisits: async limit => { assert.equal(limit, 5); return [...rows.values()].filter(row => row.state === 'pending' || (row.state === 'claimed' && leaseExpired)).slice(0, limit).map(row => { row.state = 'claimed'; row.claimId = crypto.randomUUID(); row.leaseUntil = new Date(Date.now() + 120000).toISOString(); return { ...row }; }); },
    finishClaim: async (id, outcome) => { if (finishFailure) throw new Error('Lost finalization'); const row = [...rows.values()].find(row => row.claimId === id); assert.ok(row); row.state = outcome === 'retry' ? 'pending' : outcome; finishes.push(outcome); },
    resolveCatBackupDeviceHash: async () => ({ ownerId: 'owner-a', tokenHash: hash, catalog: { complete: true, profiles: [{ catId: 'cat-a', cat: { name: 'Cat' } }] } }),
    claimRepairOwner: async () => repairs.length ? { ownerId: 'owner-a', claimId: 'repair' } : null,
    finishRepairOwner: async (_id, outcome) => repairs.push(outcome),
    saveCatalogBackup: async (_owner, catalog) => catalogSaves.push(catalog),
  };
  const helper = load('./catVisitRecovery.ts', {
    'node:crypto': crypto, 'firebase-admin/firestore': { FieldValue: { increment: n => ({ increment: n }) } },
    '@/lib/configs/firebase-admin': { getAdminFirestore: () => db, getAdminAuth: () => ({ getUser: async () => { if (authFailure) throw Object.assign(new Error('Auth unavailable'), { code: authFailure }); return { disabled: false }; } }) },
    './catHistoryNormalization': normalization, './catVisitIngestion': ingestion, './catHistoryStore': store,
    './catCatalogSync': { captureCatalog: async () => { if (unavailable) throw new Error('Quota'); return { complete: true, profiles: [], revision: 1 }; } },
    './catHistoryBackfill': { copyHistoryPage: async () => { repairs.push('page'); return { complete: false, scanned: 500, copiedRows: 100, lastError: null }; } },
    './sensorSync': sync, './sessionDate': { getLocalDateKey: () => '2026-10-04', toIsoStringFromDateLike: value => typeof value === 'string' ? value : value?.toDate?.().toISOString() ?? '' },
  });
  const visit = (id = 'sync_12345678_1000_33000', changes = {}) => normalization.buildVisitBackup(id, { catId: 'cat-a', date: '2026-10-04', time: '8:00 AM', durationSecs: 32, startedAt: '2026-10-04T08:00:00Z', endedAt: '2026-10-04T08:00:32Z', sessionStatus: 'NORMAL', syncedFromDevice: true, ...changes }, hash, 'pending');
  const queue = value => rows.set(value.sessionId, { ...value, ownerId: 'owner-a' });
  return { helper, docs, rows, finishes, repairs, catalogSaves, store, visit, queue, get attempts() { return attempts; }, loseResponse: () => { lost = true; }, setUnavailable: value => { unavailable = value; }, setAuthFailure: value => { authFailure = value; }, failFinish: value => { finishFailure = value; leaseExpired = true; } };
}

test('lostCommitResponseCountsOnce and boardAndWorkerRaceCountsOnce', async () => {
  const f = fixture(), visit = f.visit(); f.loseResponse();
  await assert.rejects(f.helper.persistVisitOnce('owner-a', visit));
  const outcomes = await Promise.all([f.helper.persistVisitOnce('owner-a', visit), f.helper.persistVisitOnce('owner-a', visit)]);
  assert.deepEqual(outcomes, ['duplicate', 'duplicate']);
  const summary = f.docs.get('users/owner-a/catStats/cat-a/daily/2026-10-04');
  assert.equal(summary.visits, 1); assert.equal(summary.totalDurationSecs, 32);
  const race = fixture(); race.queue(race.visit());
  await Promise.all([race.helper.persistVisitOnce('owner-a', race.visit()), race.helper.processCatHistoryRecovery()]);
  assert.equal(race.docs.get('users/owner-a/catStats/cat-a/daily/2026-10-04').visits, 1);
  assert.equal(race.rows.values().next().value.state, 'primary_saved');
  const contended = fixture();
  const wins = await Promise.all([contended.helper.persistVisitOnce('owner-a', contended.visit()), contended.helper.persistVisitOnce('owner-a', contended.visit())]);
  assert.deepEqual(wins.sort(), ['created', 'duplicate']);
  assert.equal(contended.attempts, 3, 'Competing callbacks must retry after observing a concurrent commit');
});

test('pastDayNeverIncrementsToday, olderReplayPreservesLastVisit and midnightReplayKeepsStoredDay', async () => {
  const f = fixture();
  f.docs.set('users/owner-a/catStats/cat-a/daily/2026-10-03', { visits: 2, totalDurationSecs: 80, lastVisit: '2026-10-04T01:00:00Z', unrelated: true });
  const visit = f.visit('sync_past', { date: '2026-10-03', startedAt: '2026-10-03T23:59:40Z', endedAt: '2026-10-04T00:00:12Z' });
  assert.equal(await f.helper.persistVisitOnce('owner-a', visit), 'created');
  assert.equal(f.docs.has('users/owner-a/catStats/cat-a'), false);
  const summary = f.docs.get('users/owner-a/catStats/cat-a/daily/2026-10-03');
  assert.equal(summary.visits, 3); assert.equal(summary.totalDurationSecs, 112); assert.equal(summary.lastVisit, '2026-10-04T01:00:00Z'); assert.equal(summary.unrelated, true);
});

test('crashBeforeFinalizeIsSafe, importedRowsNeverReplay and meaningful conflicts do not increment', async () => {
  const f = fixture(); f.queue(f.visit()); f.queue({ ...f.visit('imported'), state: 'primary_saved', tokenHash: null }); f.failFinish(true);
  await assert.rejects(f.helper.processCatHistoryRecovery());
  assert.equal(f.rows.get(f.visit().sessionId).state, 'claimed');
  f.failFinish(false); const result = await f.helper.processCatHistoryRecovery();
  assert.equal(result.duplicates, 1); assert.equal(f.docs.get('users/owner-a/catStats/cat-a').visits, 1); assert.equal(f.docs.has('users/owner-a/sessions/imported'), false);
  assert.equal(await f.helper.persistVisitOnce('owner-a', f.visit(undefined, { durationSecs: 33 })), 'conflict');
  assert.equal(f.docs.get('users/owner-a/catStats/cat-a').visits, 1);
  const jitter = f.visit(undefined, { startedAt: '2026-10-04T08:00:00.500Z', endedAt: '2026-10-04T08:00:32.500Z' });
  assert.equal(await f.helper.persistVisitOnce('owner-a', jitter), 'duplicate');
});

test('deletedCatOrRevokedDeviceCancels; authorityUnavailableRetries and repair is bounded', async () => {
  for (const path of ['users/owner-a/cats/cat-a', 'users/owner-a', 'deviceConfigs/cfg_abcdefghijklmnop', 'users/owner-a/deviceConfig/default']) {
    const f = fixture(); f.queue(f.visit()); f.docs.delete(path);
    assert.equal((await f.helper.processCatHistoryRecovery()).cancelled, 1); assert.equal(f.docs.has(`users/owner-a/sessions/${f.visit().sessionId}`), false);
  }
  const f = fixture(); f.queue(f.visit()); f.setUnavailable(true);
  assert.equal((await f.helper.processCatHistoryRecovery()).retried, 1);
  assert.equal(f.rows.get(f.visit().sessionId).state, 'pending');
  f.setUnavailable(false); f.setAuthFailure('auth/internal-error');
  assert.equal((await f.helper.processCatHistoryRecovery()).retried, 1);
  f.setAuthFailure('auth/user-not-found'); assert.equal((await f.helper.processCatHistoryRecovery()).cancelled, 1);
  f.setAuthFailure(null); f.repairs.push('due');
  const result = await f.helper.processCatHistoryRecovery(); assert.equal(result.repairedRows, 100); assert.equal(f.repairs.filter(value => value === 'page').length, 1); assert.equal(f.catalogSaves.length, 1);
});

test('current backup mapping and leases are checked; invalid records and permission errors stay closed', async () => {
  const f = fixture(); f.queue(f.visit()); f.store.resolveCatBackupDeviceHash = async () => null;
  assert.equal((await f.helper.processCatHistoryRecovery()).cancelled, 1);
  await assert.rejects(f.helper.persistVisitOnce('owner-a', { ...f.visit(), digest: 'wrong' }));
  for (const [code, status] of [[8, 429], [14, 503], [4, 503], [7, 403], [16, 401]]) assert.equal(f.helper.primaryVisitFailureStatus({ code }), status);
  assert.equal(f.helper.primaryVisitFailureStatus(new Error('Unknown')), null);
  const expired = fixture(); expired.queue(expired.visit());
  expired.store.claimPendingVisits = async () => [{ ...expired.visit(), ownerId: 'owner-a', state: 'claimed', claimId: 'expired', leaseUntil: new Date(Date.now() - 1000).toISOString() }];
  await expired.helper.processCatHistoryRecovery(); assert.equal(expired.finishes.length, 0); assert.equal(expired.docs.has(`users/owner-a/sessions/${expired.visit().sessionId}`), false);
});

test('primary quota backs off the claimed batch and repair without repeated primary calls', async () => {
  const f = fixture(); f.queue(f.visit()); f.queue(f.visit('second')); f.repairs.push('due'); f.setUnavailable(true);
  assert.equal((await f.helper.processCatHistoryRecovery()).retried, 2);
  assert.equal(f.attempts, 1);
  assert.equal(f.catalogSaves.length, 0); assert.equal(f.repairs.at(-1), 'retry');
});

test('corrupted claimed content is quarantined without counters or endless retries', async () => {
  const f = fixture(); f.queue({ ...f.visit(), digest: 'wrong' });
  const result = await f.helper.processCatHistoryRecovery();
  assert.equal(result.conflicts, 1); assert.equal(result.retried, 0);
  assert.equal(f.docs.has(`users/owner-a/sessions/${f.visit().sessionId}`), false);
});
