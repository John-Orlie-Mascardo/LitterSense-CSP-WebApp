import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';

function load(file, imports = {}) {
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: loaded, exports: loaded.exports, require: name => imports[name], Date, Buffer });
  return loaded.exports;
}
const normalization = load('./catHistoryNormalization.ts', { 'node:crypto': crypto });
const sync = load('./sensorSync.ts');
const token = 'cfg_abcdefghijklmnop';
const hash = crypto.createHash('sha256').update(token).digest('hex');
const now = new Date('2026-10-06T12:00:00Z');
const event = { eventId: '12345678_1000_33000', status: 'NORMAL', durationSecs: 32, rfidHex: 'AABB', endedAt: '2026-10-04T08:00:32Z' };

function fixture() {
  const rows = new Map(), batches = [], reads = [];
  let resolveCount = 0, fail = false;
  const device = { ownerId: 'owner-a', tokenHash: hash, catalog: { revision: 1, sourceReadAt: now.toISOString(), complete: true, profiles: [{ catId: 'cat-a', cat: { name: 'Cat' }, details: { rfidTag: 'AABB' } }] } };
  const store = {
    resolveCatBackupDevice: async value => { resolveCount++; return value === token ? device : null; },
    readVisitBackupsById: async (owner, ids) => { assert.equal(owner, 'owner-a'); assert.ok(ids.length <= 100); reads.push(ids); return ids.flatMap(id => rows.has(id) ? [rows.get(id)] : []); },
    saveVisitBackups: async (owner, visits) => {
      assert.equal(owner, 'owner-a'); assert.ok(visits.length <= 100); if (fail) throw new Error('Store unavailable'); batches.push(visits);
      const result = { inserted: 0, duplicates: 0, conflicts: 0 };
      for (const row of visits) { const old = rows.get(row.sessionId); if (!old) { rows.set(row.sessionId, row); result.inserted++; } else if (old.digest === row.digest) result.duplicates++; else result.conflicts++; }
      return result;
    },
  };
  return { helper: load('./catVisitIngestion.ts', { 'node:crypto': crypto, './sensorSync': sync, './catHistoryNormalization': normalization, './catHistoryStore': store }), device, rows, batches, reads, get resolveCount() { return resolveCount; }, fail: () => { fail = true; } };
}
const normalized = events => sync.normalizeSensorSyncRequest({ events }, now);
const pending = { saved: [], fallbackAllowed: true };

test('healthySavedVisitMirrorsOnce and healthy backup only uses confirmed primary records', async () => {
  const f = fixture();
  const saved = normalization.buildVisitBackup('sync_12345678_1000_33000', { catId: 'cat-a', date: '2026-10-04', durationSecs: 32, endedAt: event.endedAt, sessionStatus: 'NORMAL', configToken: token }, hash, 'primary_saved');
  const primary = { ownerId: 'owner-a', saved: [saved], fallbackAllowed: false };
  await f.helper.backupSensorVisits(token, normalized([event]), primary, now);
  const result = await f.helper.backupSensorVisits(token, normalized([event]), primary, now);
  assert.equal(f.rows.size, 1); assert.equal(result.duplicates, 1); assert.equal(f.resolveCount, 0);
  assert.equal(f.rows.get(saved.sessionId).state, 'primary_saved');
  assert.equal(JSON.stringify([...f.rows.values()]).includes(token), false);
  await f.helper.backupSensorVisits(token, normalized([{ ...event, eventId: 'unconfirmed' }]), { ownerId: 'owner-a', saved: [], fallbackAllowed: false }, now);
  assert.equal(f.rows.size, 1);
});
test('quotaRetryStoresOnePendingVisit; delayedReceiptKeepsOriginalDay', async () => {
  const f = fixture();
  const n = normalized([event]);
  await f.helper.backupSensorVisits(token, n, pending, now);
  const result = await f.helper.backupSensorVisits(token, n, pending, new Date('2026-10-07T12:00:00Z'));
  assert.equal(f.rows.size, 1); assert.equal(result.duplicates, 1);
  const row = [...f.rows.values()][0];
  const plan = sync.buildVisitWritePlan({ userId: 'owner-a', catId: 'cat-a', configToken: token, event: n.events[0], sessionId: row.sessionId, serverNow: now });
  assert.equal(row.data.date, plan.sessionData.date); assert.equal(row.tokenHash, hash); assert.equal(row.state, 'pending');
  assert.equal(row.data.endedAt, event.endedAt);
  assert.equal(row.sessionId, sync.buildSessionDocumentId(token, n.events[0]));
});
test('partialCatalogCannotAuthorizeVisit; ambiguousTagIsRejected; malformedAndRevokedTokensNeverQueue', async () => {
  const f = fixture(); const n = normalized([event]);
  await assert.rejects(f.helper.backupSensorVisits('bad', n, pending, now));
  await f.helper.backupSensorVisits('cfg_revoked_revoked', n, pending, now);
  f.device.catalog.complete = false; await f.helper.backupSensorVisits(token, n, pending, now);
  f.device.catalog.complete = true; f.device.catalog.profiles.push({ catId: 'cat-b', cat: { name: 'Other' }, details: { rfidTag: 'AABB' } });
  await f.helper.backupSensorVisits(token, n, pending, now);
  f.device.catalog.profiles = [{ catId: 'cat-a', cat: {}, details: { rfidTag: 'AABB' } }];
  await f.helper.backupSensorVisits(token, n, pending, now);
  assert.equal(f.rows.size, 0);
  assert.equal(f.batches.length, 0);
});
test('batches over 100 retain every countable event; ignored events never become visits', async () => {
  const f = fixture();
  const events = Array.from({ length: 205 }, (_, i) => ({ ...event, eventId: `visit-${i}`, status: i === 0 ? 'SHORT_SESSION' : 'NORMAL' }));
  await f.helper.backupSensorVisits(token, normalized([...events, { ...event, eventId: 'false-entry', status: 'FALSE_ENTRY' }]), pending, now);
  assert.equal(f.rows.size, 205);
  assert.deepEqual(f.batches.map(batch => batch.length), [100, 100, 5]);
  assert.equal(f.rows.has('sync_false-entry'), false);
  assert.equal(f.rows.get('sync_visit-0').data.sessionStatus, 'SHORT_SESSION');
  f.fail(); await assert.rejects(f.helper.backupSensorVisits(token, normalized([event]), pending, now));
});
test('firmware retry clock jitter preserves first times while changed duration, status, gas or real time conflicts', async () => {
  const f = fixture();
  await f.helper.backupSensorVisits(token, normalized([event]), pending, now);
  const original = [...f.rows.values()][0];
  const jitter = { ...event, endedAt: '2026-10-04T08:00:32.500Z' };
  const result = await f.helper.backupSensorVisits(token, normalized([jitter]), pending, now);
  assert.equal(result.duplicates, 1); assert.equal(result.conflicts, 0);
  assert.equal(f.batches.at(-1)[0].data.endedAt, original.data.endedAt);
  for (const changed of [{ durationSecs: 33 }, { status: 'ABNORMAL' }, { mq135Delta: 9 }, { endedAt: '2026-10-04T08:00:33Z' }]) {
    const conflict = await f.helper.backupSensorVisits(token, normalized([{ ...event, ...changed }]), pending, now);
    assert.equal(conflict.conflicts, 1);
  }
});
test('firmware jitter across midnight retains the first activity day, including two retries in one batch', async () => {
  const f = fixture();
  const end = new Date(2026, 9, 4, 23, 59, 59, 800);
  const first = { ...event, endedAt: end.toISOString() };
  const second = { ...first, endedAt: new Date(end.getTime() + 300).toISOString() };
  const result = await f.helper.backupSensorVisits(token, normalized([first, second]), pending, now);
  assert.equal(result.inserted, 1); assert.equal(result.duplicates, 1); assert.equal(result.conflicts, 0);
  const row = [...f.rows.values()][0];
  assert.equal(row.data.date, '2026-10-04');
  assert.equal(row.data.endedAt, first.endedAt);
});
