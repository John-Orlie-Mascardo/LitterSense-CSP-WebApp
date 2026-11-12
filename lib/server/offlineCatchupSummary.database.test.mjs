import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// QA #15: events saved while a board was offline get ONE summary push after it reconnects.
// "Saved offline" = the board was actually silent (no heartbeat) when the event happened.
const migrations = [
  'supabase/migrations/20261109170000_device_offline_push.sql',
  'supabase/migrations/20261109150000_offline_catchup_summary.sql',
  'supabase/migrations/20261109190000_offline_catchup_reconnect.sql',
  'supabase/migrations/20261112113806_offline_summary_retry_dedup.sql',
];

async function fixture(t, notifications = { rfidVisitAlerts: true }) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const file of [
    'docs/sms-storage.sql',
    'docs/sms-outbox.sql',
    'docs/sensor-snapshot.sql',
    'supabase/migrations/20261006121032_operational_foundation.sql',
  ]) await db.exec(readFileSync(file, 'utf8'));
  await db.exec("alter table public.sms_outbox add token_hash text; alter table public.sms_outbox add context jsonb not null default '{}'; alter table public.sms_outbox add push_status text not null default 'pending' check (push_status in ('pending','sending','sent','failed','unknown','cancelled'));");
  for (const file of migrations) {
    assert.ok(existsSync(file), `${file} is missing`);
    await db.exec(readFileSync(file, 'utf8'));
  }
  await db.query("insert into public.sms_accounts(owner_id, notifications) values('owner', $1::jsonb)", [JSON.stringify(notifications)]);
  await db.exec("insert into public.sms_devices(token_hash,owner_id) values(repeat('a',64),'owner');");

  const secondsAgo = (s) => new Date(Date.now() - s * 1000).toISOString();
  const rfidHeartbeat = (s) => db.query(
    "insert into public.operational_records(document_path,owner_id,data) values('users/owner/deviceState/current','owner',jsonb_build_object('updatedAt',$1::text)) on conflict(document_path) do update set data=excluded.data",
    [secondsAgo(s)],
  );
  const gasHeartbeat = (s) => db.query(
    "insert into public.sensor_snapshots(token_hash,source,data,received_at) values(repeat('a',64),'gas-ultrasonic','{}'::jsonb,$1::timestamptz) on conflict(token_hash,source) do update set received_at=excluded.received_at",
    [secondsAgo(s)],
  );
  const rfidVisit = (key, ageSeconds) => db.query(
    "insert into public.sms_outbox(event_key,owner_id,cat_id,reason,message,status,push_status,context) values($1,'owner','cat-1','Saved notification','','cancelled','pending',jsonb_build_object('source','rfid_visit','title','Mochi left the litter box','occurredAt',$2::text)) on conflict(event_key) do nothing",
    [key, secondsAgo(ageSeconds)],
  );
  const gas = (key, reason, ageSeconds) => db.query(
    "insert into public.sms_outbox(event_key,owner_id,reason,message,status,push_status,context) values($1,'owner',$2,'','cancelled','pending',jsonb_build_object('source','gas_history','occurredAt',$3::text)) on conflict(event_key) do nothing",
    [key, reason, secondsAgo(ageSeconds)],
  );
  const pushOf = async (key) => (await db.query('select push_status from public.sms_outbox where event_key=$1', [key])).rows[0].push_status;
  const summaries = async () => (await db.query("select push_status,context from public.sms_outbox where context->>'kind'='offline_summary' order by created_at")).rows;
  const quietFor = (seconds) => db.query("update public.sms_outbox set context=context||jsonb_build_object('lastEventAt',(now()-make_interval(secs=>$1))::text) where context->>'kind'='offline_summary' and context->>'held'='true'", [seconds]);
  const release = async () => (await db.query('select public.release_offline_summaries() as released')).rows[0].released;
  return { rfidHeartbeat, gasHeartbeat, rfidVisit, gas, pushOf, summaries, quietFor, release };
}

test('a live visit pushes on its own while the board keeps sending heartbeats', async (t) => {
  const f = await fixture(t);
  await f.rfidHeartbeat(2);
  await f.rfidVisit('live', 4);
  assert.equal(await f.pushOf('live'), 'pending');
  assert.equal((await f.summaries()).length, 0);
});

test('a live visit uploaded late is still live if the board never went silent', async (t) => {
  const f = await fixture(t);
  await f.rfidHeartbeat(3);
  await f.rfidVisit('slow-upload', 40);
  assert.equal(await f.pushOf('slow-upload'), 'pending');
  assert.equal((await f.summaries()).length, 0);
});

test('a visit that ended just before reconnecting is grouped when the board was silent', async (t) => {
  const f = await fixture(t);
  await f.rfidHeartbeat(240);
  await f.rfidVisit('offline-visit', 34);
  assert.equal(await f.pushOf('offline-visit'), 'cancelled');
  const [held] = await f.summaries();
  assert.equal(held.context.visits, 1);
});

test('grouping also works when the reconnect heartbeat arrives before the saved visit', async (t) => {
  const f = await fixture(t);
  await f.rfidHeartbeat(240);
  await f.rfidHeartbeat(0);
  await f.rfidVisit('offline-visit', 40);
  assert.equal(await f.pushOf('offline-visit'), 'cancelled');
  assert.equal((await f.summaries())[0].context.visits, 1);
});

test('a new visit after reconnecting is live again', async (t) => {
  const f = await fixture(t);
  await f.rfidHeartbeat(240);
  await f.rfidHeartbeat(30);
  await f.rfidHeartbeat(1);
  await f.rfidVisit('after-reconnect', 5);
  assert.equal(await f.pushOf('after-reconnect'), 'pending');
});

test('RFID visits and gas detections from one outage share one summary', async (t) => {
  const f = await fixture(t);
  await f.rfidHeartbeat(300);
  await f.gasHeartbeat(300);
  await f.rfidVisit('v1', 200);
  await f.gas('g1', 'Ammonia detected', 180);
  await f.gasHeartbeat(0);
  await f.gas('g2', 'Hydrogen sulfide detected', 120);
  await f.rfidVisit('v2', 50);
  for (const key of ['v1', 'g1', 'g2', 'v2']) assert.equal(await f.pushOf(key), 'cancelled', key);
  const all = await f.summaries();
  assert.equal(all.length, 1);
  assert.equal(all[0].context.visits, 2);
  assert.equal(all[0].context.urine, 1);
  assert.equal(all[0].context.stool, 1);
});

test('a live gas detection with a fresh gas heartbeat pushes on its own', async (t) => {
  const f = await fixture(t);
  await f.gasHeartbeat(20);
  await f.gas('live-gas', 'Ammonia detected', 20);
  assert.equal(await f.pushOf('live-gas'), 'pending');
});

test('the summary is released after 10 quiet seconds, as one normal push', async (t) => {
  const f = await fixture(t);
  await f.rfidHeartbeat(300);
  await f.rfidVisit('v1', 200);
  await f.rfidVisit('v2', 100);
  await f.quietFor(5);
  assert.equal(await f.release(), 0);
  await f.quietFor(12);
  assert.equal(await f.release(), 1);
  const [sent] = await f.summaries();
  assert.equal(sent.push_status, 'pending');
  assert.equal(sent.context.source, 'system');
  assert.equal(sent.context.held, 'false');
  assert.equal(sent.context.title, 'While LitterSense was offline');
  assert.equal(sent.context.body, '2 visits');
});

test('a later outage starts a new summary', async (t) => {
  const f = await fixture(t);
  await f.rfidHeartbeat(300);
  await f.rfidVisit('v1', 200);
  await f.quietFor(12);
  await f.release();
  await f.rfidHeartbeat(120);
  await f.rfidVisit('v2', 60);
  assert.equal((await f.summaries()).length, 2);
});

test('alerts the owner turned off are not grouped or counted', async (t) => {
  const f = await fixture(t, { rfidVisitAlerts: true, ammoniaAlerts: false });
  await f.gasHeartbeat(400);
  await f.gas('muted', 'Ammonia detected', 300);
  assert.equal(await f.pushOf('muted'), 'pending', 'left for the existing preference filter');
  assert.equal((await f.summaries()).length, 0);
});

test('retrying a saved visit counts it once and does not delay the summary', async t => {
  const f = await fixture(t);
  await f.rfidHeartbeat(300);
  await f.rfidVisit('brody-exit', 40);
  await f.quietFor(12);
  const before = (await f.summaries())[0].context;
  await f.rfidVisit('brody-exit', 40);
  await f.rfidVisit('brody-exit', 40);
  assert.deepEqual((await f.summaries())[0].context, before);
  assert.equal(await f.release(), 1);
  assert.equal((await f.summaries())[0].context.body, '1 visit');
});

test('retried gas detections and distinct visits preserve the exact mixed total', async t => {
  const f = await fixture(t);
  await f.rfidHeartbeat(300);
  await f.gasHeartbeat(300);
  for (let i = 0; i < 3; i++) {
    await f.rfidVisit('v1', 40);
    await f.gas('urine', 'Ammonia detected', 60);
    await f.gas('stool', 'Hydrogen sulfide detected', 50);
  }
  await f.rfidVisit('v2', 30);
  await f.quietFor(12);
  await f.release();
  assert.equal((await f.summaries())[0].context.body, '2 visits, 1 urine detection, 1 stool detection');
});

test('a retry after release neither sends a new summary nor adds to the next batch', async t => {
  const f = await fixture(t);
  await f.rfidHeartbeat(300);
  await f.rfidVisit('first', 60);
  await f.quietFor(12);
  await f.release();
  await f.rfidVisit('first', 60);
  assert.equal((await f.summaries()).length, 1);
  await f.rfidVisit('second', 40);
  await f.rfidVisit('first', 60);
  const held = (await f.summaries()).filter(row => row.context.held === 'true');
  assert.equal(held.length, 1);
  assert.equal(held[0].context.visits, 1);
});
