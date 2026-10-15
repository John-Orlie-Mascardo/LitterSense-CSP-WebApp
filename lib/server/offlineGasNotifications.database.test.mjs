import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const migration='supabase/migrations/20261012210000_offline_gas_notifications.sql';
async function fixture(t) {
 const db=new PGlite();t.after(()=>db.close());
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 for(const f of ['docs/sms-storage.sql','docs/sms-outbox.sql','docs/sensor-snapshot.sql','supabase/migrations/20261006121032_operational_foundation.sql','supabase/migrations/20261006160000_operational_app_records.sql']) await db.exec(readFileSync(f,'utf8'));
 await db.exec("alter table public.sms_outbox add token_hash text;alter table public.sms_outbox add context jsonb not null default '{}';alter table public.sms_outbox add push_status text not null default 'pending';");
 const notice=readFileSync('supabase/migrations/20261008094002_notification_realtime.sql','utf8');
 await db.exec(notice.slice(notice.indexOf('create or replace function')));
 assert.ok(existsSync(migration),'Offline gas notification bridge is missing');
 await db.exec(readFileSync(migration,'utf8'));
 await db.exec(readFileSync('supabase/migrations/20261012230000_gas_notification_time_format.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261013090000_simplify_saved_gas_notifications.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261015090000_stable_gas_event_ids.sql','utf8'));
 assert.ok(existsSync('supabase/migrations/20261015100000_dedupe_live_saved_gas_alerts.sql'),'Cross-path gas deduplication migration is missing');
 await db.exec(readFileSync('supabase/migrations/20261015100000_dedupe_live_saved_gas_alerts.sql','utf8'));
 await db.exec(`update public.operational_migration_state set imported_at=now(),runtime_primary=true,cutover_at=now();
 insert into public.sms_accounts(owner_id) values('owner'),('other');
 insert into public.sms_devices(token_hash,owner_id) values(repeat('a',64),'owner'),(repeat('b',64),'other');
 insert into public.operational_records(document_path,owner_id,data) values('users/owner','owner','{}'),('users/other','other','{}');
 insert into public.sensor_snapshots values(repeat('a',64),'gas-ultrasonic','{"mq135Raw":1,"mq136Raw":1}',now());`);
 const base=Date.now()-180000;
 const insert=async(id,offset,raw=0,extra={},uid='owner')=>{
 const data={source:'gas-ultrasonic',deviceId:'gas',eventId:id,capturedAt:new Date(base+offset).toISOString(),timingKnown:true,mq135Raw:raw,mq136Raw:1,distanceCm:35,entranceOccupied:false,...extra};
 await db.query('insert into public.operational_records(document_path,owner_id,data) values($1,$2,$3) on conflict do nothing',[`users/${uid}/sensorHistory/${id}`,uid,JSON.stringify(data)]);return data;
 };
 const notices=async()=> (await db.query("select data from public.operational_records where document_path like 'users/owner/notifications/%'")).rows;
 const queue=async()=> (await db.query("select * from public.sms_outbox where owner_id='owner' order by created_at,id")).rows;
 const ingest=async(ammonia)=>db.query("select public.ingest_sensor_sms($1,'[]'::jsonb,jsonb_build_object('ammonia',$2::boolean,'h2s',false),6)",['a'.repeat(64),ammonia]);
 return {db,insert,notices,queue,ingest,base};
}
test('missed detection is atomically saved to bell and push with original time; clear and repeated samples do not flood',async t=>{
 const f=await fixture(t); await f.insert('clear',0,1);const detected=await f.insert('detect',10000);await f.insert('same',20000);await f.insert('detect',10000);await f.insert('cleared',30000,1);
 const notes=await f.notices(),rows=await f.queue();assert.equal(notes.length,1);assert.equal(rows.length,1);
 assert.equal(notes[0].data.createdAt,detected.capturedAt);assert.match(notes[0].data.message,/Odor detected at/);assert.equal(notes[0].data.title,'Urine detected');assert.equal(rows[0].context.occurredAt,detected.capturedAt);assert.equal(rows[0].status,'cancelled');assert.equal(rows[0].push_status,'pending');
 assert.equal((await f.db.query('select data from public.sensor_snapshots')).rows[0].data.mq135Raw,1);
 await f.insert('nextDetect',40000);assert.equal((await f.notices()).length,2);
});
test('opt-out, unknown times, other owners, doorway-only changes and already-live gas do not create historical pushes',async t=>{
 const f=await fixture(t);await f.insert('unknown',0,0,{capturedAt:null,timingKnown:false});await f.insert('other',0,0,{},'other');await f.insert('door',1000,1,{entranceOccupied:true});
 await f.db.exec(`insert into public.operational_records values('users/owner/settings/notifications','owner','{"ammoniaAlerts":false}',1,now());`);
 await f.insert('disabled',2000);assert.equal((await f.queue()).length,0);
 await f.insert('clear',3000,1);assert.equal((await f.queue()).length,0);
 await f.db.exec("delete from public.operational_records where document_path='users/owner/settings/notifications';update public.sensor_snapshots set data='{\"mq135Raw\":0,\"mq136Raw\":1}';");
 await f.insert('ongoing',4000);assert.equal((await f.queue()).length,0);
});
test('existing live gas alert covers the replay and H2S has its own preference and time',async t=>{
 const f=await fixture(t);await f.db.query("insert into public.sms_outbox(event_key,owner_id,reason,message,created_at,context) values('live','owner','Ammonia detected','', $1,'{}')",[new Date(f.base+5000).toISOString()]);
 await f.insert('detect',0);assert.equal((await f.queue()).length,1);
 await f.insert('h2s',10000,1,{mq136Raw:0});const q=await f.queue();assert.equal(q.length,2);assert.equal(q[1].reason,'Hydrogen sulfide detected');
});
test('saved history arriving before its live state still produces only one alert, while a cleared next episode remains distinct',async t=>{
 const f=await fixture(t);await f.db.exec('delete from public.sensor_snapshots');
 await f.insert('initialClear',0,1);await f.insert('savedDetect',10000);
 await f.ingest(true);
 assert.equal((await f.queue()).length,1,'the later live state must reuse the saved episode');
 assert.equal((await f.notices()).length,1,'the bell must show one item for the episode');
 await f.ingest(false);await f.insert('savedClear',20000,1);await f.ingest(true);
 assert.equal((await f.queue()).length,2,'a Clear to Detected transition must remain a new episode');
 assert.equal((await f.notices()).length,2);
});
test('history before a heartbeat still queues, and a different later live alert cannot erase a closed episode',async t=>{
 const f=await fixture(t);await f.db.exec('delete from public.sensor_snapshots');
 await f.insert('initialClear',0,1);await f.insert('offlineDetect',10000);await f.insert('offlineClear',20000,1);
 assert.equal((await f.queue()).length,1,'heartbeat absence must not discard history alerts');
 await f.insert('clear2',30000,1);
 await f.db.query("insert into public.sms_outbox(event_key,owner_id,reason,message,created_at,context) values('later-live','owner','Ammonia detected','',$1,'{}')",[new Date(f.base+80000).toISOString()]);
 await f.db.exec(`insert into public.sensor_snapshots values(repeat('a',64),'gas-ultrasonic','{"mq135Raw":0,"mq136Raw":1}',now());`);
 await f.insert('earlierDetect',40000);await f.insert('earlierClear',50000,1);
 assert.equal((await f.queue()).length,3,'later ongoing detection must not hide an earlier closed detection');
});
test('out-of-order samples for one episode do not create two gas alerts',async t=>{
 const f=await fixture(t);await f.insert('clear',0,1);await f.insert('laterSample',20000);await f.insert('earlierSample',10000);await f.insert('clearEnd',30000,1);
 assert.equal((await f.queue()).length,1);assert.equal((await f.notices()).length,1);
});
test('owner-scoped reconciliation recovers saved detections from before the bridge without a second copy',async t=>{
 const f=await fixture(t);await f.db.exec('alter table public.operational_records disable trigger queue_missed_gas_history');
 await f.insert('clear',0,1);const detected=await f.insert('detect',10000);await f.insert('clearEnd',30000,1);
 await f.db.exec('alter table public.operational_records enable trigger queue_missed_gas_history');
 assert.equal((await f.queue()).length,0);
 await f.db.exec('set role service_role');
 await f.db.query('select public.reconcile_gas_history($1,$2)', ['owner',new Date(f.base-1000).toISOString()]);
 await f.db.query('select public.reconcile_gas_history($1,$2)', ['owner',new Date(f.base-1000).toISOString()]);
 await f.db.exec('reset role');
 assert.equal((await f.queue()).length,1);assert.equal((await f.notices())[0].data.createdAt,detected.capturedAt);
 const otherRows=await f.db.query("select * from public.sms_outbox where owner_id='other'");assert.equal(otherRows.rows.length,0);
});
test('a downstream alert failure rolls back history and queues so the board can retry safely',async t=>{
 const f=await fixture(t);await f.db.exec(`create function public.reject_test_alert() returns trigger language plpgsql as $$ begin raise exception 'Outbox unavailable'; end $$;
 create trigger reject_test_alert before insert on public.sms_outbox for each row execute function public.reject_test_alert();`);
 await assert.rejects(f.insert('failed',10000),/Outbox unavailable/);
 assert.equal((await f.db.query("select count(*)::int n from public.operational_records where document_path like '%/sensorHistory/failed'")).rows[0].n,0);assert.equal((await f.queue()).length,0);
 await f.db.exec('drop trigger reject_test_alert on public.sms_outbox');await f.insert('failed',10000);assert.equal((await f.queue()).length,1);
});
test('old detections remain truthful bell history without stale push flood and browser roles cannot reconcile',async t=>{
 const f=await fixture(t);await f.insert('old',0,0,{capturedAt:new Date(Date.now()-25*3600000).toISOString()});
 assert.equal((await f.queue())[0].push_status,'cancelled');assert.equal((await f.notices()).length,1);
 const perms=(await f.db.query("select has_function_privilege('anon','public.reconcile_gas_history(text,timestamptz)','execute') a,has_function_privilege('authenticated','public.reconcile_gas_history(text,timestamptz)','execute') b")).rows[0];assert.equal(perms.a,false);assert.equal(perms.b,false);
});
test('actual service role can commit history and its atomic alert bridge, while browser roles cannot call the helper',async t=>{
 const f=await fixture(t);await f.db.exec('set role service_role');
 await f.insert('serviceDetect',10000);assert.equal((await f.queue()).length,1);
 await f.db.exec('reset role');
 const perms=(await f.db.query("select has_function_privilege('anon','public.queue_missed_gas_event(public.operational_records)','execute') a,has_function_privilege('authenticated','public.queue_missed_gas_event(public.operational_records)','execute') b")).rows[0];assert.equal(perms.a,false);assert.equal(perms.b,false);
});
test('a short offline detection is not discarded by an arbitrary age threshold',async t=>{
 const f=await fixture(t);await f.insert('shortDetect',0,0,{capturedAt:new Date(Date.now()-3000).toISOString()});
 assert.equal((await f.queue()).length,1);
});

test('saved notifications use the original detection time without seconds in 12-hour Manila format',async t=>{
 const f=await fixture(t);
 await f.insert('formatDetect',0,0,{capturedAt:'2026-10-12T13:29:06.000Z'});
 const rows=await f.queue(),notes=await f.notices();
 const expected='Odor detected at Oct 12, 2026, 9:29 PM. Check the litter box and ventilation.';
 assert.equal(rows[0].context.body,expected);
 assert.equal(notes[0].data.message,expected);
 assert.equal(notes[0].data.createdAt,'2026-10-12T13:29:06.000Z');
});
