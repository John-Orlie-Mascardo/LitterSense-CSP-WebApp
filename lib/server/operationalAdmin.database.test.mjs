import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
const root = fileURLToPath(new URL('../../', import.meta.url));
const migration = `${root}supabase/migrations/20261012120000_operational_admin.sql`;
const actor = { actorUid: 'admin', actorEmail: 'admin@example.com' };
async function fixture(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const file of ['docs/sms-storage.sql', 'supabase/migrations/20261006121032_operational_foundation.sql', 'supabase/migrations/20261006160000_operational_app_records.sql', 'supabase/migrations/20261006162000_operational_account_deletion.sql']) await db.exec(readFileSync(`${root}${file}`, 'utf8'));
  assert.ok(existsSync(migration), 'Operational admin migration is required');
  await db.exec(readFileSync(migration, 'utf8'));
  await db.exec(`update public.operational_migration_state set imported_at=now(),runtime_primary=true,cutover_at=now();
    insert into public.operational_records(document_path,owner_id,data) values
    ('users/owner','owner','{"email":"owner@example.com","fullName":"Owner","createdAt":{"__firestoreType":"timestamp","value":"2020-01-01T00:00:00Z"}}'),
    ('users/other','other','{}'), ('users/owner/cats/cat','owner','{}'),
    ('cameraDevices/cam_owner','owner','{"ownerId":"owner"}'),
    ('deleteRequests/legacy','owner','{"userId":"owner","status":"pending"}');
    insert into public.sms_accounts(owner_id) values('owner'),('other');
    insert into public.sms_devices(token_hash,owner_id) values(repeat('a',64),'owner');`);
  const transition = async (action, extra = {}) => (await db.query('select public.operational_admin_transition($1::jsonb) result', [JSON.stringify({ userId: 'owner', action, ...actor, ...extra })])).rows[0].result;
  const profile = async () => (await db.query("select data from public.operational_records where document_path='users/owner'")).rows[0]?.data;
  const audits = async () => (await db.query("select document_path,owner_id,data from public.operational_records where owner_id='@system' order by updated_at,document_path")).rows;
  return { db, transition, profile, audits };
}
test('request atomically updates existing owner and records tagged server timestamp audit', async t => {
  const f = await fixture(t);
  const r = await f.transition('request', { actorUid: 'owner', actorEmail: 'owner@example.com', reason: 'Leaving' });
  assert.equal(r.profile.deletionStatus, 'pending');
  assert.equal(r.profile.deletionRequestedAt.__firestoreType, 'timestamp');
  assert.equal((await f.profile()).createdAt.value, '2020-01-01T00:00:00Z');
  const logs = await f.audits(); assert.equal(logs.length, 1);
  assert.equal(logs[0].owner_id, '@system'); assert.equal(logs[0].document_path, `auditLogs/${r.auditId}`);
  assert.equal(logs[0].data.action, 'deletion_requested'); assert.deepEqual(logs[0].data.details, { reason: 'Leaving' });
  assert.equal(logs[0].data.createdAt.value, r.profile.deletionRequestedAt.value);
  await assert.rejects(f.transition('request', { actorUid: 'owner' }), e => e.code === '55000');
  assert.equal((await f.audits()).length, 1);
});
test('missing owners and unready cutover cannot create deletion or audit records', async t => {
  const f = await fixture(t);
  await assert.rejects(f.transition('request', { userId: 'missing', actorUid: 'missing' }), e => e.code === 'P0002');
  await f.db.exec('update public.operational_migration_state set runtime_primary=false,cutover_at=null');
  await assert.rejects(f.transition('request', { actorUid: 'owner' }), e => e.code === '55000');
  await assert.rejects(f.db.query('select public.operational_write_audit($1::jsonb)', [JSON.stringify({ action: 'admin_login', ...actor })]), e => e.code === '55000');
  assert.equal((await f.audits()).length, 0);
});
test('reject only returns pending requests to normal and removes deletion metadata', async t => {
  const f = await fixture(t); await f.transition('request', { actorUid: 'owner' });
  const r = await f.transition('reject');
  assert.equal(r.profile.deletionStatus, 'none'); assert.equal('deletionRequestedAt' in r.profile, false); assert.equal('deletionError' in r.profile, false);
  assert.equal((await f.audits())[1].data.action, 'deletion_rejected');
  await assert.rejects(f.transition('reject'), e => e.code === '55000');
  await f.transition('request', { actorUid: 'owner' }); assert.equal((await f.profile()).deletionStatus, 'pending');
});
test('start cleans owner linked records and SMS FKs but preserves profile for failed retry', async t => {
  const f = await fixture(t); await f.transition('request', { actorUid: 'owner' });
  const r = await f.transition('start'); assert.equal(r.auditId, null); assert.equal(r.profile.deletionStatus, 'processing');
  assert.equal((await f.db.query("select count(*)::int n from public.operational_records where owner_id='owner'")).rows[0].n, 1);
  assert.equal((await f.db.query("select count(*)::int n from public.sms_devices where owner_id='owner'")).rows[0].n, 0);
  assert.equal((await f.db.query("select count(*)::int n from public.sms_accounts where owner_id='other'")).rows[0].n, 1);
  const results = await Promise.allSettled([f.transition('start'), f.transition('reject')]);
  assert.ok(results.every(r => r.status === 'rejected' && r.reason.code === '55000'));
  const failed = await f.transition('fail', { error: 'Storage unavailable' });
  assert.equal(failed.profile.fullName, 'Owner'); assert.equal(failed.profile.deletionStatus, 'failed'); assert.equal(failed.profile.deletionError, 'Storage unavailable');
  await f.transition('start'); assert.equal((await f.profile()).deletionError, null);
  await f.transition('finish'); assert.equal(await f.profile(), undefined);
  const logs = await f.audits(); assert.deepEqual(logs.map(r => r.data.action), ['deletion_requested', 'deletion_failed', 'deletion_approved']);
  assert.equal(logs[2].data.targetEmail, 'owner@example.com'); assert.deepEqual(logs[2].data.details, { result: 'permanently_deleted' });
});
test('two concurrent approvals admit only one processing transition', async t => {
  const f = await fixture(t); await f.transition('request', { actorUid: 'owner' });
  const results = await Promise.allSettled([f.transition('start'), f.transition('start')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, '55000');
});
test('cleanup blocks ordinary profile writes, linked data and SMS projection resurrection', async t => {
  const f = await fixture(t); await f.transition('request', { actorUid: 'owner' }); await f.transition('start');
  await assert.rejects(f.db.query('select public.operational_commit($1,$2::jsonb)', ['owner', JSON.stringify([{ action:'set', document_path:'users/owner', expected_revision:3, data:{} }])]), e => e.code === '55000');
  await assert.rejects(f.db.exec("insert into public.operational_records(document_path,owner_id,data) values('users/owner/cats/new','owner','{}')"), e => e.code === '55000');
  await assert.rejects(f.db.query('select public.sync_sms_account($1,$2,$3::jsonb,$4::jsonb,$5)', ['owner', '', '{}', '[]', null]), e => e.code === '55000');
  await f.transition('fail');
  await assert.rejects(f.db.exec("insert into public.sms_accounts(owner_id) values('owner')"), e => e.code === '55000');
});
test('RPC inputs and browser permissions cannot bypass owner or state guards', async t => {
  const f = await fixture(t);
  for (const input of [{ userId: 'owner', action: 'request', actorUid: 'other' }, { userId: '../owner', action: 'request', actorUid: 'admin' }, { userId: 'owner', action:'unknown', actorUid:'admin' }]) await assert.rejects(f.db.query('select public.operational_admin_transition($1::jsonb)', [JSON.stringify(input)]), e => ['22023','42501'].includes(e.code));
  for (const action of ['reject','start','fail','finish']) await assert.rejects(f.transition(action), e => e.code === '55000');
  for (const role of ['anon','authenticated']) {
    await f.db.exec(`set role ${role}`);
    await assert.rejects(f.db.query('select public.operational_admin_transition($1::jsonb)', [JSON.stringify({ userId:'owner', action:'request',actorUid:'owner' })]), e => e.code === '42501');
    await assert.rejects(f.db.query('select public.operational_write_audit($1::jsonb)', [JSON.stringify({ action:'admin_login', ...actor })]), e => e.code === '42501');
    await f.db.exec('reset role');
  }
});
test('independent admin audit persists under system owner and stays immutable through generic commits', async t => {
  const f = await fixture(t); await f.db.exec('set role service_role');
  const id = (await f.db.query('select public.operational_write_audit($1::jsonb) id', [JSON.stringify({ action:'admin_login', ...actor })])).rows[0].id;
  const log = (await f.audits())[0]; assert.equal(log.document_path, `auditLogs/${id}`); assert.equal(log.data.createdAt.__firestoreType,'timestamp');
  await assert.rejects(f.db.query('select public.operational_commit($1,$2::jsonb)', ['@system', JSON.stringify([{action:'delete',document_path:`auditLogs/${id}`,expected_revision:1}])]), e => e.code === '42501');
});


test('management service-account actors produce a canonical audit record', async t => {
  const f = await fixture(t);
  const input = { action:'admin_granted', actorUid:'service-account:firebase-admin@littersense.iam.gserviceaccount.com', actorEmail:'firebase-admin@littersense.iam.gserviceaccount.com', targetUid:'owner' };
  const id = (await f.db.query('select public.operational_write_audit($1::jsonb) id', [JSON.stringify(input)])).rows[0].id;
  assert.equal((await f.audits())[0].document_path, 'auditLogs/'+id);
  assert.equal((await f.audits())[0].data.actorUid,input.actorUid);
});


test('permanent deletion prevents stale verified requests from recreating root or linked data', async t => {
  const f=await fixture(t); await f.transition('request',{actorUid:'owner'}); await f.transition('start'); await f.transition('finish');
  for(const sql of ["insert into public.operational_records(document_path,owner_id,data) values('users/owner','owner','{}')","insert into public.operational_records(document_path,owner_id,data) values('users/owner/cats/new','owner','{}')","insert into public.sms_accounts(owner_id) values('owner')"]) await assert.rejects(f.db.exec(sql),e=>e.code==='55000');
});

test('an abandoned processing lease can be reclaimed without admitting a concurrent approval', async t => {
  const f=await fixture(t); await f.transition('request',{actorUid:'owner'}); await f.transition('start');
  await assert.rejects(f.transition('start'),e=>e.code==='55000');
  await f.db.exec("update public.operational_records set data=data||jsonb_build_object('deletionStartedAt',to_char(now()-interval '11 minutes','YYYY-MM-DD HH24:MI:SS')) where document_path='users/owner'");
  await f.transition('start'); assert.equal((await f.profile()).deletionStatus,'processing');
});
