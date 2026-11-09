import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// QA #15: events uploaded after reconnecting get one summary push instead of one push each.
const migration = 'supabase/migrations/20261109150000_offline_catchup_summary.sql';

async function fixture(t, notifications = {}) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const file of ['docs/sms-storage.sql', 'docs/sms-outbox.sql']) await db.exec(readFileSync(file, 'utf8'));
  await db.exec("alter table public.sms_outbox add token_hash text; alter table public.sms_outbox add context jsonb not null default '{}'; alter table public.sms_outbox add push_status text not null default 'pending' check (push_status in ('pending','sending','sent','failed','unknown','cancelled'));");
  assert.ok(existsSync(migration), 'Offline catch-up summary migration is missing');
  await db.exec(readFileSync(migration, 'utf8'));
  await db.query("insert into public.sms_accounts(owner_id, notifications) values('owner', $1::jsonb)", [JSON.stringify(notifications)]);

  const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
  const rfid = (key, ageMinutes) => db.query(
    "insert into public.sms_outbox(event_key,owner_id,cat_id,reason,message,status,push_status,context) values($1,'owner','cat-1','Saved notification','','cancelled','pending',jsonb_build_object('source','rfid_visit','title','Mochi left the litter box','occurredAt',$2::text))",
    [key, minutesAgo(ageMinutes)],
  );
  const gas = (key, reason, ageMinutes, pushStatus = 'pending') => db.query(
    "insert into public.sms_outbox(event_key,owner_id,reason,message,status,push_status,context) values($1,'owner',$2,'','cancelled',$3,jsonb_build_object('source','gas_history','occurredAt',$4::text))",
    [key, reason, pushStatus, minutesAgo(ageMinutes)],
  );
  const row = async (key) => (await db.query('select push_status,status,context from public.sms_outbox where event_key=$1', [key])).rows[0];
  const summaries = async () => (await db.query("select event_key,push_status,context from public.sms_outbox where context->>'kind'='offline_summary' order by created_at")).rows;
  const quietFor = (seconds) => db.query("update public.sms_outbox set context=context||jsonb_build_object('lastEventAt',(now()-make_interval(secs=>$1))::text) where context->>'kind'='offline_summary' and push_status='cancelled' and context->>'held'='true'", [seconds]);
  const release = async () => (await db.query('select public.release_offline_summaries() as released')).rows[0].released;
  return { db, rfid, gas, row, summaries, quietFor, release };
}

test('a live visit still pushes on its own and starts no summary', async (t) => {
  const f = await fixture(t, { rfidVisitAlerts: true });
  await f.rfid('push:owner:live', 0);
  assert.equal((await f.row('push:owner:live')).push_status, 'pending');
  assert.equal((await f.summaries()).length, 0);
});

test('catch-up visits and detections skip their own push and are counted in one held summary', async (t) => {
  const f = await fixture(t, { rfidVisitAlerts: true });
  await f.rfid('push:owner:old-visit-1', 20);
  await f.rfid('push:owner:old-visit-2', 15);
  await f.gas('gas-history:a', 'Ammonia detected', 10);
  await f.gas('gas-history:b', 'Hydrogen sulfide detected', 9);
  for (const key of ['push:owner:old-visit-1', 'push:owner:old-visit-2', 'gas-history:a', 'gas-history:b']) {
    const event = await f.row(key);
    assert.equal(event.push_status, 'cancelled', key);
    assert.equal(event.status, 'cancelled', `${key} SMS status unchanged`);
  }
  const held = await f.summaries();
  assert.equal(held.length, 1);
  assert.equal(held[0].push_status, 'cancelled', 'held summaries are not sendable yet');
  assert.equal(held[0].context.held, 'true');
  assert.equal(held[0].context.visits, 2);
  assert.equal(held[0].context.urine, 1);
  assert.equal(held[0].context.stool, 1);
});

test('the summary waits until catch-up has been quiet for a minute, then becomes one normal push', async (t) => {
  const f = await fixture(t, { rfidVisitAlerts: true });
  await f.rfid('push:owner:old-visit-1', 20);
  await f.rfid('push:owner:old-visit-2', 15);
  await f.gas('gas-history:a', 'Ammonia detected', 10);
  await f.quietFor(30);
  assert.equal(await f.release(), 0);
  await f.quietFor(90);
  assert.equal(await f.release(), 1);
  const [sent] = await f.summaries();
  assert.equal(sent.push_status, 'pending');
  assert.equal(sent.context.source, 'system');
  assert.equal(sent.context.held, 'false');
  assert.equal(sent.context.title, 'While LitterSense was offline');
  assert.equal(sent.context.body, '2 visits, 1 urine detection');
  assert.equal(sent.context.url, '/dashboard/notifications');
});

test('catch-up after a summary was released starts a new summary', async (t) => {
  const f = await fixture(t, { rfidVisitAlerts: true });
  await f.rfid('push:owner:old-visit-1', 20);
  await f.quietFor(90);
  await f.release();
  await f.rfid('push:owner:old-visit-2', 15);
  const all = await f.summaries();
  assert.equal(all.length, 2);
  assert.equal(all[1].context.visits, 1);
});

test('alerts the owner turned off, or already-expired pushes, are not counted', async (t) => {
  const f = await fixture(t, { rfidVisitAlerts: true, ammoniaAlerts: false });
  await f.gas('gas-history:muted', 'Ammonia detected', 10);
  await f.gas('gas-history:expired', 'Hydrogen sulfide detected', 60 * 25, 'cancelled');
  assert.equal((await f.summaries()).length, 0);
  assert.equal((await f.row('gas-history:muted')).push_status, 'pending', 'left for the existing preference filter');
});
