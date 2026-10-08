import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../../supabase/migrations/20261006121032_operational_foundation.sql', import.meta.url), 'utf8');
const row = (path, data, owner = 'owner') => ({ document_path: path, owner_id: owner, data, source_update_at: '2026-10-06T00:00:00Z' });
test('PostgreSQL foundation: dry run, repeat import, conflicts, tag claims, ownership and atomic writes', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.exec(migration);
    const call = (records, apply) => db.query('select public.operational_import($1::jsonb, $2::boolean) as result', [JSON.stringify(records), apply]);
    const count = async () => Number((await db.query('select count(*) from public.operational_records')).rows[0].count);
    const records = [row('users/owner', {}), row('users/owner/catDetails/cat', { rfidTag: 'ab-cd' }), row('users/owner/cats/cat', { name: 'Pusa' })];
    assert.equal((await call(records, false)).rows[0].result.inserted, 3); assert.equal(await count(), 0);
    await call(records, true); assert.equal(await count(), 3);
    assert.equal((await call(records, true)).rows[0].result.duplicates, 3);
    await assert.rejects(call([row('users/owner/new/item', {}), row('users/owner', { changed: true })], true), /conflicts/); assert.equal(await count(), 3);
    await assert.rejects(call([row('users/owner/cats/other', {}), row('users/owner/catDetails/other', { rfidTag: 'ABCD' })], true)); assert.equal(await count(), 3);
    await assert.rejects(call([row('users/other', {})], true));
    await assert.rejects(call([row('cameraDevices/cam', {})], true));
    await assert.rejects(call([row('users/owner/catDetails/orphan', { rfidTag: '1234' })], true));
    const commit = (owner, changes) => db.query('select public.operational_commit($1, $2::jsonb)', [owner, JSON.stringify(changes)]);
    await assert.rejects(commit('other', [{ action: 'set', document_path: 'users/owner', expected_revision: 1, data: {} }]), /owner/);
    await assert.rejects(commit('owner', [{ action: 'set', document_path: 'users/owner', expected_revision: 99, data: {} }]), /Revision/);
    await commit('owner', [{ action: 'set', document_path: 'users/owner/catDetails/cat', expected_revision: 1, data: { rfidTag: '1234' } }]);
    assert.equal((await db.query('select tag from public.operational_tag_claims')).rows[0].tag, '1234');
    await assert.rejects(commit('owner', [{ action: 'set', document_path: 'users/owner/new/item', expected_revision: 0, data: {} }, { action: 'set', document_path: 'users/owner', expected_revision: 99, data: {} }])); assert.equal(await count(), 3);
    await commit('owner', [
      { action: 'set', document_path: 'users/owner/catDetails/newcat', expected_revision: 0, data: { rfidTag: '5678' } },
      { action: 'set', document_path: 'users/owner/cats/newcat', expected_revision: 0, data: { name: 'New cat' } },
    ]);
    assert.equal(await count(), 5);
    await assert.rejects(commit('owner', [
      { action: 'set', document_path: 'users/owner/cats/duplicate', expected_revision: 0, data: {} },
      { action: 'set', document_path: 'users/owner/catDetails/duplicate', expected_revision: 0, data: { rfidTag: '5678' } },
    ])); assert.equal(await count(), 5);
    const permissions = (await db.query("select has_table_privilege('anon','public.operational_records','SELECT') as read, has_function_privilege('authenticated','public.operational_import(jsonb,boolean)','EXECUTE') as execute, has_function_privilege('service_role','public.operational_commit(text,jsonb)','EXECUTE') as server")).rows[0];
    assert.deepEqual(permissions, { read: false, execute: false, server: true });
    await db.exec('set role service_role');
    await commit('owner', [{ action: 'set', document_path: 'users/owner', expected_revision: 1, data: { onboardingComplete: true } }]);
    await db.exec('reset role; set role anon');
    await assert.rejects(call([], false), /permission denied/);
    await db.exec('reset role; update public.operational_migration_state set runtime_primary = true, cutover_at = clock_timestamp()');
    await assert.rejects(call(records, true), /locked after/);
  } finally { await db.close(); }
});
