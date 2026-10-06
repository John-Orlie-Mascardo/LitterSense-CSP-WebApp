import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';

function load() {
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./catHistoryNormalization.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: loaded, exports: loaded.exports, require: () => crypto, Date, Buffer });
  return loaded.exports;
}
const data = { catId: 'cat-a', date: '2026-10-04', durationSecs: 32, startedAt: '2026-10-04T08:00:00Z', endedAt: '2026-10-04T08:00:32Z', sessionStatus: 'NORMAL' };

test('receipt does not change digest; meaningful changes and duplicate IDs are distinguished', () => {
  const { buildVisitBackup, mergeHistoryById } = load();
  const first = buildVisitBackup('sync_event_1', data, null, 'pending');
  const retry = buildVisitBackup('sync_event_1', { ...data, createdAt: '2026-10-05T00:00:00Z', receivedAt: '2026-10-06T00:00:00Z', configToken: 'must-not-copy', wifiPassword: 'must-not-copy' }, null, 'primary_saved');
  assert.equal(first.digest, retry.digest);
  assert.equal('configToken' in retry.data, false);
  assert.equal('wifiPassword' in retry.data, false);
  for (const update of [{ catId: 'cat-b' }, { durationSecs: 33 }, { date: '2026-10-05' }, { endedAt: '2026-10-04T08:00:33Z' }, { sessionStatus: 'ABNORMAL' }, { mq135Delta: 9 }]) {
    assert.notEqual(first.digest, buildVisitBackup('sync_event_1', { ...data, ...update }, null, 'pending').digest);
  }
  assert.equal(mergeHistoryById([retry], [first]).length, 1);
  assert.equal(mergeHistoryById([retry], [first])[0], retry);
  assert.throws(() => mergeHistoryById([first], [buildVisitBackup('sync_event_1', { ...data, catId: 'cat-b' }, null, 'pending')]), /conflict/i);
});

test('legacy dates remain undated; bad paths, states, numbers and unsupported fields fail closed', () => {
  const { buildVisitBackup, sanitizeProfileBackup } = load();
  const undated = buildVisitBackup('legacy-id', { catId: 'cat-a', durationSecs: 1 }, null, 'primary_saved');
  assert.equal(undated.data.date, '');
  assert.equal(undated.data.endedAt, '');
  assert.equal(buildVisitBackup('valid', { ...data, startedAt: undefined }, null, 'pending').data.startedAt, data.startedAt);
  for (const update of [{ durationSecs: NaN }, { durationSecs: -1 }, { date: '2026-02-31' }, { endedAt: 'invalid' }, { customUnknown: 1 }]) {
    assert.throws(() => buildVisitBackup('id', { ...data, ...update }, null, 'pending'));
  }
  for (const id of ['', '.', '..', 'a/b', 'a'.repeat(1501)]) assert.throws(() => buildVisitBackup(id, data, null, 'pending'));
  assert.throws(() => buildVisitBackup('id', data, 'bad-hash', 'pending'));
  assert.throws(() => buildVisitBackup('id', data, null, 'invented'));
  const profile = sanitizeProfileBackup({ catId: 'cat-a', cat: { name: 'Cat', avatar: null, isOnline: true }, details: { rfidTag: 'AABB', weight: 4, baseline: { avgVisitsPerDay: 2, avgDurationSecs: 32, mq135DeltaPercent: 0, mq136DeltaPercent: 0, lastUpdated: '2026-10-04' } } });
  assert.equal(profile.details.weight, 4);
  assert.throws(() => sanitizeProfileBackup({ ...profile, details: { unsupported: true } }));
  assert.throws(() => sanitizeProfileBackup({ ...profile, details: { baseline: { avgVisitsPerDay: '2' } } }));
  assert.throws(() => sanitizeProfileBackup({ ...profile, cat: { isOnline: 'true' } }));
  assert.throws(() => sanitizeProfileBackup({ ...profile, cat: { name: 'x'.repeat(33000) } }));
});
