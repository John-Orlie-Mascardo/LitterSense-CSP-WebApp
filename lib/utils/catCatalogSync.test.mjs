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
function fixture() {
  const primary = new Map(), mirrors = [], writes = [];
  let unavailable = false, mirrorFailure = false;
  const ref = path => ({ path });
  const snapshot = path => ({ id: path.split('/').at(-1), exists: primary.has(path), data: () => primary.get(path) });
  const db = { doc: ref, collection: path => ({ path, collection: true }), runTransaction: async callback => {
    if (unavailable) throw new Error('Primary unavailable');
    const pending = []; let writing = false;
    const tx = {
      get: async target => { assert.equal(writing, false, 'All transaction reads precede writes'); return target.collection ? { docs: [...primary.keys()].filter(path => path.startsWith(`${target.path}/`) && !path.slice(target.path.length + 1).includes('/')).map(snapshot) } : snapshot(target.path); },
      set: (target, data, options) => { writing = true; pending.push(() => { primary.set(target.path, options?.merge ? { ...primary.get(target.path), ...data } : data); writes.push(target.path); }); },
      update: (target, data) => { writing = true; pending.push(() => { assert.equal(primary.has(target.path), true); primary.set(target.path, { ...primary.get(target.path), ...data }); writes.push(target.path); }); },
      delete: target => { writing = true; pending.push(() => { primary.delete(target.path); writes.push(target.path); }); },
    };
    const result = await callback(tx); pending.forEach(fn => fn()); return result;
  } };
  const normalization = load('./catHistoryNormalization.ts', { 'node:crypto': crypto });
  const helper = load('./catCatalogSync.ts', { '@/lib/configs/firebase-admin': { getAdminFirestore: () => db }, './catHistoryNormalization': normalization, './catHistoryStore': { saveCatalogBackup: async (owner, catalog) => { assert.equal(owner, 'owner-a'); if (mirrorFailure) throw new Error('Mirror unavailable'); mirrors.push(catalog); } }, './sessionDate': { getLocalDateKey: () => '2026-10-04' } });
  return { helper, primary, mirrors, writes, unavailable: () => { unavailable = true; }, failMirror: () => { mirrorFailure = true; } };
}

test('new cats require a valid RFID tag while existing untagged profiles can still be edited', () => {
  const { helper } = fixture();
  for (const tag of [undefined, '', ' ', '—', 'not-a-tag']) {
    assert.throws(() => helper.validateCatMutation({ action: 'create', catId: 'new', cat: { name: 'New' }, details: { rfidTag: tag } }), /Scan and verify/);
  }
  assert.equal(helper.validateCatMutation({ action: 'create', catId: 'new', cat: { name: 'New' }, details: { rfidTag: 'AA-BB' } }).catId, 'new');
  assert.equal(helper.validateCatMutation({ action: 'update', catId: 'old', cat: { name: 'Renamed' } }).catId, 'old');
});
test('completeEmptyCatalogDiffersFromUnavailable; primaryUnavailableDoesNotReportProfileSaved', async () => {
  const f = fixture();
  const catalog = await f.helper.captureCatalog('owner-a');
  assert.equal(catalog.complete, true);
  assert.equal(catalog.profiles.length, 0);
  assert.equal(catalog.revision, 1);
  const firstWrites = f.writes.length;
  const again = await f.helper.captureCatalog('owner-a');
  assert.equal(again.revision, 1);
  assert.equal(f.writes.length, firstWrites, 'Catalog reads must not consume another Firebase write');
  f.unavailable();
  await assert.rejects(f.helper.captureCatalog('owner-a'));
  await assert.rejects(f.helper.mutateCatProfile('owner-a', { action: 'create', catId: 'cat-a', cat: { name: 'Cat' } }));
  assert.equal(f.primary.has('users/owner-a/cats/cat-a'), false);
});
test('confirmed profile mutations preserve details, delete summaries and advance atomic revisions', async () => {
  const f = fixture();
  const first = await f.helper.mutateCatProfile('owner-a', { action: 'create', catId: 'cat-a', cat: { name: 'Cat', status: 'normal', avatar: null, isOnline: false }, details: { rfidTag: 'AABB', weight: 4, baseline: { avgVisitsPerDay: 2, avgDurationSecs: 32, mq135DeltaPercent: 0, mq136DeltaPercent: 0, lastUpdated: '2026-10-04' } } });
  assert.equal(first.revision, 1); assert.equal(first.backupPending, false);
  await f.helper.mutateCatProfile('owner-a', { action: 'update', catId: 'cat-a', details: { breed: 'Mixed', baseline: { avgVisitsPerDay: 3 } } });
  const updated = f.primary.get('users/owner-a/catDetails/cat-a');
  assert.equal(updated.weight, 4); assert.equal(updated.rfidTag, 'AABB'); assert.equal(updated.baseline.avgDurationSecs, 32); assert.equal(updated.baseline.avgVisitsPerDay, 3);
  f.primary.set('users/owner-a/cats/cat-a', { ...f.primary.get('users/owner-a/cats/cat-a'), unrelatedLegacyField: 'preserve' });
  const pending = await f.helper.mutateCatProfile('owner-a', { action: 'update', catId: 'cat-a', cat: { name: 'Updated' } });
  assert.equal(pending.backupPending, true);
  assert.equal(f.primary.get('users/owner-a/cats/cat-a').unrelatedLegacyField, 'preserve');
  const deleted = await f.helper.mutateCatProfile('owner-a', { action: 'delete', catId: 'cat-a' });
  assert.equal(deleted.revision, 4);
  assert.equal(f.mirrors.at(-1).profiles.length, 0);
  for (const path of ['cats/cat-a', 'catDetails/cat-a', 'catStats/cat-a', 'dailyCatStats/2026-10-04/cats/cat-a', 'catSessionLog/cat-a']) assert.ok(f.writes.includes(`users/owner-a/${path}`));
  assert.equal(f.writes.some(path => path.includes('/sessions/')), false);
});
test('legacy weightKg is copied as supported weight without changing primary details', async () => {
  const f = fixture();
  f.primary.set('users/owner-a/cats/cat-a', { name: 'Cat' });
  f.primary.set('users/owner-a/catDetails/cat-a', { rfidTag: 'AABB', weightKg: 4 });
  const catalog = await f.helper.captureCatalog('owner-a');
  assert.equal(catalog.profiles[0].details.weight, 4);
  assert.equal('weightKg' in catalog.profiles[0].details, false);
  assert.equal(f.primary.get('users/owner-a/catDetails/cat-a').weightKg, 4);
  const updated = await f.helper.mutateCatProfile('owner-a', { action: 'update', catId: 'cat-a', cat: { name: 'Updated' } });
  assert.equal(updated.backupPending, false);
  assert.equal(f.mirrors.at(-1).profiles[0].details.weight, 4);
});
test('mirrorFailureKeepsConfirmedPrimaryMutation; invalid mutations never write', async () => {
  const f = fixture(); f.failMirror();
  const result = await f.helper.mutateCatProfile('owner-a', { action: 'create', catId: 'cat-a', cat: { name: 'Cat' }, details: { rfidTag: 'AABB' } });
  assert.equal(result.backupPending, true);
  assert.equal(f.primary.get('users/owner-a/cats/cat-a').name, 'Cat');
  for (const mutation of [{ action: 'delete', catId: '../bad' }, { action: 'update', catId: 'cat-a', cat: { ownerId: 'other' } }, { action: 'update', catId: 'cat-a', details: { baseline: { avgVisitsPerDay: 'wrong' } } }, { action: 'update', catId: 'cat-a', details: { baseline: { configToken: 'reject' } } }, { action: 'create', catId: 'cat-a', cat: { name: 'Overwrite' } }]) await assert.rejects(f.helper.mutateCatProfile('owner-a', mutation));
  assert.equal(f.primary.get('users/owner-a/backupState/catalog').revision, 1);
});
test('olderProfileCopyCannotResurrectCat because capture and deletion carry ordered primary revisions', async () => {
  const f = fixture();
  await f.helper.mutateCatProfile('owner-a', { action: 'create', catId: 'cat-a', cat: { name: 'Cat' }, details: { rfidTag: 'AABB' } });
  const oldCopy = await f.helper.captureCatalog('owner-a');
  const deletion = await f.helper.mutateCatProfile('owner-a', { action: 'delete', catId: 'cat-a', today: '2026-10-03' });
  assert.equal(oldCopy.profiles.length, 1);
  assert.ok(oldCopy.revision < deletion.revision);
  assert.equal(f.mirrors.at(-1).profiles.length, 0);
  assert.equal(f.mirrors.at(-1).revision, deletion.revision);
  assert.ok(f.writes.includes('users/owner-a/dailyCatStats/2026-10-03/cats/cat-a'));
});
test('another cat cannot claim an existing tag at save time; its current owner can keep it', async () => {
  const f = fixture();
  await f.helper.mutateCatProfile('owner-a', { action: 'create', catId: 'cat-a', cat: { name: 'Zeno' }, details: { rfidTag: 'AABB' } });
  await assert.rejects(f.helper.mutateCatProfile('owner-a', { action: 'create', catId: 'cat-b', cat: { name: 'Teddy' }, details: { rfidTag: 'aa-bb' } }), /Zeno/);
  assert.equal(f.primary.has('users/owner-a/cats/cat-b'), false);
  await f.helper.mutateCatProfile('owner-a', { action: 'update', catId: 'cat-a', details: { rfidTag: 'AABB' } });
});
