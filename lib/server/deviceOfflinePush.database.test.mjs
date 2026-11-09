import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// QA #14: one phone push when a board has been silent for more than 5 minutes.
const migration = 'supabase/migrations/20261109170000_device_offline_push.sql';

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const file of [
    'docs/sms-storage.sql',
    'docs/sms-outbox.sql',
    'docs/sensor-snapshot.sql',
    'supabase/migrations/20261006121032_operational_foundation.sql',
  ]) await db.exec(readFileSync(file, 'utf8'));
  await db.exec("alter table public.sms_outbox add token_hash text; alter table public.sms_outbox add context jsonb not null default '{}'; alter table public.sms_outbox add push_status text not null default 'pending';");
  assert.ok(existsSync(migration), 'Device offline push migration is missing');
  await db.exec(readFileSync(migration, 'utf8'));
  await db.exec(`
    insert into public.sms_accounts(owner_id) values('owner');
    insert into public.sms_devices(token_hash,owner_id) values(repeat('a',64),'owner');
  `);
  const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
  const rfidSeen = (minutes) => db.query(
    "insert into public.operational_records(document_path,owner_id,data) values('users/owner/deviceState/current','owner',jsonb_build_object('updatedAt',$1::text)) on conflict(document_path) do update set data=excluded.data",
    [ago(minutes)],
  );
  const gasSeen = (minutes) => db.query(
    "insert into public.sensor_snapshots(token_hash,source,data,received_at) values(repeat('a',64),'gas-ultrasonic','{}'::jsonb,$1::timestamptz) on conflict(token_hash,source) do update set received_at=excluded.received_at",
    [ago(minutes)],
  );
  const cameraSeen = (id, minutes) => db.query(
    "insert into public.operational_records(document_path,owner_id,data) values('cameraDevices/'||$1,'owner',jsonb_build_object('ownerId','owner','lastSeenAt',$2::text))",
    [id, ago(minutes)],
  );
  const check = async () => (await db.query('select public.queue_device_offline_pushes() as queued')).rows[0].queued;
  const pushes = async () => (await db.query("select event_key,reason,push_status,context from public.sms_outbox where context->>'kind'='device_offline' order by context->>'board'")).rows;
  return { db, rfidSeen, gasSeen, cameraSeen, check, pushes };
}

test('boards heard from in the last 5 minutes send nothing', async (t) => {
  const f = await fixture(t);
  await f.rfidSeen(1);
  await f.gasSeen(4);
  await f.cameraSeen('cam-1', 2);
  assert.equal(await f.check(), 0);
  assert.equal((await f.pushes()).length, 0);
});

test('a board silent for over 5 minutes queues one normal system push naming it', async (t) => {
  const f = await fixture(t);
  await f.rfidSeen(7);
  await f.gasSeen(1);
  assert.equal(await f.check(), 1);
  const [push] = await f.pushes();
  assert.equal(push.reason, 'Saved notification');
  assert.equal(push.push_status, 'pending');
  assert.equal(push.context.source, 'system');
  assert.equal(push.context.board, 'rfid');
  assert.equal(push.context.title, 'RFID reader is offline');
  assert.match(push.context.body, /^Last signal at \d{1,2}:\d{2} [AP]M\. Check its power and Wi-Fi\.$/);
});

test('the same outage is announced once, however many times the check runs', async (t) => {
  const f = await fixture(t);
  await f.gasSeen(10);
  assert.equal(await f.check(), 1);
  assert.equal(await f.check(), 0);
  assert.equal(await f.check(), 0);
  assert.equal((await f.pushes()).length, 1);
});

test('a new outage after the board came back is announced again', async (t) => {
  const f = await fixture(t);
  await f.gasSeen(10);
  await f.check();
  await f.gasSeen(8);
  assert.equal(await f.check(), 1);
  assert.equal((await f.pushes()).length, 2);
});

test('all three boards are covered, using the newest camera record', async (t) => {
  const f = await fixture(t);
  await f.rfidSeen(6);
  await f.gasSeen(6);
  await f.cameraSeen('old-cam', 60 * 24 * 30);
  await f.cameraSeen('cam-1', 9);
  assert.equal(await f.check(), 3);
  const boards = (await f.pushes()).map((push) => push.context.board).join(',');
  assert.equal(boards, 'camera,gas-ultrasonic,rfid');
});

test('boards silent for more than a day are left alone (unused or retired)', async (t) => {
  const f = await fixture(t);
  await f.rfidSeen(60 * 25);
  await f.cameraSeen('old-cam', 60 * 24 * 30);
  assert.equal(await f.check(), 0);
});

test('a bad timestamp is ignored instead of breaking the whole check', async (t) => {
  const f = await fixture(t);
  await f.db.query("insert into public.operational_records(document_path,owner_id,data) values('users/owner/deviceState/current','owner','{\"updatedAt\":\"not-a-date\"}'::jsonb)");
  await f.gasSeen(10);
  assert.equal(await f.check(), 1);
});
