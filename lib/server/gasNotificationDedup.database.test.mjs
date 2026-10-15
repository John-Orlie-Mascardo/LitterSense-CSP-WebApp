import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = 'supabase/migrations/20261015090000_stable_gas_event_ids.sql';

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const file of [
    'docs/sms-storage.sql',
    'docs/sms-outbox.sql',
    'supabase/migrations/20261006121032_operational_foundation.sql',
    'supabase/migrations/20261006160000_operational_app_records.sql',
  ]) await db.exec(readFileSync(file, 'utf8'));
  await db.exec("alter table public.sms_outbox add token_hash text; alter table public.sms_outbox add context jsonb not null default '{}'; alter table public.sms_outbox add push_status text not null default 'pending';");
  await db.exec(readFileSync('docs/gas-push-cooldown.sql', 'utf8'));
  const notificationBridge = readFileSync('supabase/migrations/20261008094002_notification_realtime.sql', 'utf8');
  await db.exec(notificationBridge.slice(notificationBridge.indexOf('create or replace function')));
  assert.ok(existsSync(migration), 'Stable gas event migration is missing');
  await db.exec(readFileSync(migration, 'utf8'));
  await db.exec(`
    update public.operational_migration_state set imported_at=now(), runtime_primary=true, cutover_at=now();
    insert into public.sms_accounts(owner_id) values('owner');
    insert into public.sms_devices(token_hash,owner_id) values(repeat('a',64),'owner');
  `);
  const ingest = async (ammonia) => db.query(
    "select public.ingest_sensor_sms($1,'[]'::jsonb,jsonb_build_object('ammonia',$2::boolean,'h2s',false),6)",
    ['a'.repeat(64), ammonia],
  );
  const queue = async () => (await db.query("select event_key,status,push_status,context from public.sms_outbox where owner_id='owner' order by created_at,id")).rows;
  const notices = async () => (await db.query("select document_path,data from public.operational_records where document_path like 'users/owner/notifications/%' order by document_path")).rows;
  return { db, ingest, queue, notices };
}

test('one gas episode has one stable ID while the next recovered episode is not time-suppressed', async (t) => {
  const f = await fixture(t);

  await f.ingest(false);
  await f.ingest(true);
  await f.ingest(true);

  let rows = await f.queue();
  assert.equal(rows.length, 1, 'repeated Detected heartbeats must reuse one episode');
  assert.match(rows[0].context.eventId, /^[0-9a-f-]{36}$/);
  assert.match(rows[0].event_key, new RegExp(`${rows[0].context.eventId}$`));
  assert.equal((await f.notices())[0].data.eventId, rows[0].context.eventId);

  await f.ingest(false);
  await f.ingest(true);
  await f.ingest(true);

  rows = await f.queue();
  assert.equal(rows.length, 2, 'a new Clear to Detected episode must alert even inside one minute');
  assert.notEqual(rows[0].context.eventId, rows[1].context.eventId);
  assert.equal(rows[0].push_status, 'pending');
  assert.equal(rows[1].push_status, 'pending');
  assert.equal(rows[0].status, 'pending');
  assert.equal(rows[1].status, 'cancelled', 'SMS keeps its hourly credit limit');
  assert.equal((await f.notices()).length, 2);
});
