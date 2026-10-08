import test from 'node:test';
import assert from 'node:assert/strict';
import { exportValue, manifestDigest, mergeVisitBackups, validateManifest, mapSourceRecords } from './operationalImport.mjs';
import { exportFirestore, importManifest } from '../../scripts/operational-import.mjs';

const row = (path, data, owner = 'owner') => ({ document_path: path, owner_id: owner, data, source_update_at: '2026-10-06T00:00:00Z' });
const manifest = records => ({ version: 1, complete: true, exportedAt: '2026-10-06T00:00:00Z', records, digest: manifestDigest(records) });

test('legacy root snapshots and analysis leases are preserved under verified owners without replacing current snapshots', () => {
  const source = [row('users/owner', {}), row('deviceConfigs/config', { ownerId: 'owner' }), row('users/owner/deviceState/current', { online: true }), row('deviceState/current', { configToken: 'config', online: false }), row('predictiveHealthLimits/owner', { leaseUntilMs: 12 })];
  const mapped = mapSourceRecords(source);
  assert.equal(validateManifest(manifest(mapped)).records, source.length);
  assert.equal(mapped.find(r => r.document_path === 'users/owner/deviceState/current').data.online, true);
  assert.equal(mapped.find(r => r.document_path === 'users/owner/internal/legacyDeviceState_current').data.online, false);
  assert.equal(mapped.find(r => r.document_path === 'users/owner/internal/predictiveHealthLimit').data.leaseUntilMs, 12);
  assert.throws(() => mapSourceRecords([...source, row('deviceState/unowned', {})]), /ownership/);
  assert.throws(() => validateManifest(manifest(mapSourceRecords([...source, row('users/owner/internal/predictiveHealthLimit', {})]))), /duplicate/);
});

test('completed deletion audits survive import without restoring deleted owners', () => {
  const audit = row('deleteRequests/old', { userId: 'deleted-owner', status: 'deleted', reason: 'Requested' }, 'deleted-owner');
  assert.equal(validateManifest(manifest([row('users/owner', {}), audit])).records, 2);
  assert.throws(() => validateManifest(manifest([{ ...audit, data: { ...audit.data, status: 'pending' } }])), /no profile/);
  assert.throws(() => validateManifest(manifest([audit, row('deviceConfigs/old', { ownerId: 'deleted-owner' }, 'deleted-owner')])), /no profile/);
});

test('ambiguous imported push token ownership blocks cutover instead of assigning an account', () => {
  const token = 'phone-token-abcdefghijklmnop';
  assert.throws(() => validateManifest(manifest([row('users/owner', { fcmTokens: [token] }), row('users/other', { fcmTokens: [token] }, 'other')])), /push token ownership/);
});
test('import preserves IDs, rejects changed digest, duplicate tags and orphan details', () => {
  const records = [row('users/owner', {}), row('users/owner/cats/cat', { name: 'Pusa' }), row('users/owner/catDetails/cat', { rfidTag: 'ab-cd' })];
  assert.equal(validateManifest(manifest(records)).records, 3);
  assert.throws(() => validateManifest({ ...manifest(records), digest: 'bad' }), /digest/);
  assert.throws(() => validateManifest(manifest([...records, row('users/owner/cats/other', {}), row('users/owner/catDetails/other', { rfidTag: 'ABCD' })])), /Duplicate RFID/);
  assert.throws(() => validateManifest(manifest([records[0], records[2]])), /matching profile/);
  assert.throws(() => validateManifest(manifest([row('users/other', {})])), /owner/);
});
test('camera import requires preserved credential ownership', () => {
  const pointer = row('users/owner/deviceState/camera', { deviceId: 'cam_123' });
  assert.throws(() => validateManifest(manifest([row('users/owner', {}), pointer])), /credential/);
  assert.equal(validateManifest(manifest([row('users/owner', {}), pointer, row('cameraDevices/cam_123', { ownerId: 'owner', keyHash: 'a'.repeat(64) })])).records, 3);
});
test('Firestore types preserve timestamp, reference, bytes and coordinates', () => {
  assert.deepEqual(exportValue({ time: { toDate: () => new Date('2026-10-06') }, ref: { path: 'users/owner', get() {} }, bytes: Buffer.from('hello'), point: { latitude: 1, longitude: 2 } }), {
    time: { __firestoreType: 'timestamp', value: '2026-10-06T00:00:00.000Z' }, ref: { __firestoreType: 'reference', value: 'users/owner' }, bytes: { __firestoreType: 'bytes', value: 'aGVsbG8=' }, point: { __firestoreType: 'geopoint', latitude: 1, longitude: 2 },
  });
});
test('dry run uses existing transport and never applies by default', async () => {
  let body;
  const result = await importManifest(manifest([row('users/owner', {})]), false, async (path, init) => {
    assert.equal(path, 'rpc/operational_import'); body = JSON.parse(init.body);
    return Response.json({ applied: false, inserted: 1, duplicates: 0 });
  });
  assert.equal(body.p_apply, false); assert.equal(result.mode, 'dry-run');
});
test('failed source read never becomes a complete empty export', async () => {
  await assert.rejects(exportFirestore({ listCollections: async () => { throw new Error('quota'); } }), /quota/);
  await assert.rejects(exportFirestore({ listCollections: async () => [{ id: 'unmapped' }] }), /Unmapped/);
});
test('source changing between export passes is rejected', async () => {
  let version = 0;
  const ref = { path: 'users/owner', listCollections: async () => [], get: async () => ({ exists: true, data: () => ({ version: ++version }), updateTime: { toDate: () => new Date('2026-10-06') } }) };
  await assert.rejects(exportFirestore({ listCollections: async () => [{ id: 'users', listDocuments: async () => [ref] }] }), /changed during/);
});
test('export bounds parallel source reads and retains both complete verification passes', async () => {
  let active = 0, peak = 0;
  const refs = Array.from({ length: 16 }, (_, i) => ({ path: `users/owner${i}`, listCollections: async () => [], get: async () => {
    active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 5)); active--;
    return { exists: true, data: () => ({}), updateTime: { toDate: () => new Date('2026-10-06') } };
  } }));
  const progress = [];
  const result = await exportFirestore({ listCollections: async () => [{ id: 'users', listDocuments: async () => refs }] }, event => progress.push(event));
  assert.equal(result.records.length, 16); assert.ok(peak > 1 && peak <= 8);
  assert.deepEqual(progress.filter(event => event.complete).map(event => event.records), [16, 16]);
});
test('a verified private source checkpoint is preserved before ownership validation without becoming an import manifest', async () => {
  const ref = { path: 'deviceState/current', listCollections: async () => [], get: async () => ({ exists: true, data: () => ({}), updateTime: { toDate: () => new Date('2026-10-06') } }) };
  let checkpoint;
  await assert.rejects(exportFirestore({ listCollections: async () => [{ id: 'deviceState', listDocuments: async () => [ref] }] }, () => {}, async source => { checkpoint = source; }), /ownership/);
  assert.equal(checkpoint.sourceVerified, true); assert.equal(checkpoint.sourceRecords.length, 1);
  assert.throws(() => validateManifest(checkpoint), /complete version-1/);
});
test('conflict reports do not echo database details containing secrets', async () => {
  await assert.rejects(importManifest(manifest([row('users/owner', {})]), true, async () => Response.json({ code: '23505', details: 'secret camera key' }, { status: 409 })), error => error.report.code === '23505' && !JSON.stringify(error.report).includes('secret'));
});
test('pending Supabase visits join the export once; cancelled and conflicting backups never resurrect', () => {
  const source = manifest([row('users/owner', {}), row('users/owner/cats/cat', {})]);
  const backup = { owner_id: 'owner', session_id: 'session', cat_id: 'cat', data: { catId: 'cat', durationSecs: 42 }, digest: 'digest', token_hash: null, state: 'pending', conflict_detected: false, backed_up_at: '2026-10-06T00:00:00Z' };
  const normalize = (_id, data) => ({ catId: data.catId, data, digest: data.durationSecs === 42 ? 'digest' : 'changed' });
  const merged = mergeVisitBackups(source, [backup], normalize);
  assert.equal(merged.visitBackupSummary.added, 1);
  assert.equal(mergeVisitBackups(merged, [backup], normalize).visitBackupSummary.duplicates, 1);
  assert.equal(mergeVisitBackups(source, [{ ...backup, state: 'cancelled' }], normalize).records.length, 2);
  assert.throws(() => mergeVisitBackups(source, [{ ...backup, conflict_detected: true }], normalize), /conflict/);
  assert.throws(() => mergeVisitBackups(merged, [{ ...backup, data: { catId: 'cat', durationSecs: 43 }, digest: 'changed' }], normalize), /differs/);
});

test('approved visit conflict preserves both copies and rejects a changed approval fingerprint', () => {
  const visit = row('users/owner/sessions/session', { catId: 'cat', durationSecs: 43 });
  const source = manifest([row('users/owner', {}), row('users/owner/cats/cat', {}), visit]);
  const backup = { owner_id: 'owner', session_id: 'session', cat_id: 'cat', data: { catId: 'cat', durationSecs: 42 }, digest: 'digest', state: 'primary_saved', conflict_detected: true, backed_up_at: '2026-10-06T00:00:00Z' };
  const normalize = (_id, data) => ({ catId: data.catId, data, digest: data.durationSecs === 42 ? 'digest' : 'changed' });
  const decision = { document_path: visit.document_path, source_digest: manifestDigest([visit]), backup_digest: manifestDigest([{ document_path: visit.document_path, data: backup }]) };
  const merged = mergeVisitBackups(source, [backup], normalize, [decision]);
  assert.equal(merged.visitBackupSummary.preservedConflicts, 1);
  assert.deepEqual(merged.records.find(r => r.document_path === visit.document_path).data, visit.data);
  assert.deepEqual(merged.records.find(r => r.data.backup).data.backup, backup);
  assert.throws(() => mergeVisitBackups(source, [{ ...backup, backed_up_at: '2026-10-07T00:00:00Z' }], normalize, [decision]), /conflict/);
});
