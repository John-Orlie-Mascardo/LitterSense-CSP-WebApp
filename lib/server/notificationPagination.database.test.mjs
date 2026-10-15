import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

async function fixture(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(readFileSync('supabase/migrations/20261006121032_operational_foundation.sql', 'utf8'));
  const migration = readdirSync('supabase/migrations').find(name => name.endsWith('_notification_pagination.sql'));
  await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'));
  await db.exec("update public.operational_migration_state set imported_at=now(),runtime_primary=true,cutover_at=now(); insert into public.operational_records(document_path,owner_id,data) values('users/owner','owner','{}'),('users/other','other','{}');");
  const put = (id, data, uid='owner') => db.query('insert into public.operational_records(document_path,owner_id,data) values($1,$2,$3)', [`users/${uid}/notifications/${id}`,uid,data]);
  const page = async (category='all', cursor=null, size=25, uid='owner') => (await db.query('select public.operational_notification_page($1,$2,$3,$4::jsonb) as result', [uid,category,size,JSON.stringify(cursor)])).rows[0].result;
  const bulk = async (action,uid='owner') => (await db.query('select public.operational_notification_bulk($1,$2) as result',[uid,action])).rows[0].result;
  return {db,put,page,bulk};
}

test('notification pages bound transferred rows and count unread records beyond the newest page', async t => {
  const f=await fixture(t);
  for(let i=0;i<61;i++) await f.put(`n${String(i).padStart(3,'0')}`,{type:'health',createdAt:`2026-10-15T10:${String(i%60).padStart(2,'0')}:00.000Z`,isRead:i>=40});
  await f.put('foreign',{createdAt:'2027-01-01T00:00:00Z',isRead:false},'other');
  const first=await f.page(); assert.equal(first.rows.length,25); assert.equal(first.unreadCount,40); assert.equal(first.totalCount,61); assert.ok(first.nextCursor);
  const second=await f.page('all',first.nextCursor); const third=await f.page('all',second.nextCursor);
  const ids=[...first.rows,...second.rows,...third.rows].map(row=>row.path);
  assert.equal(ids.length,61); assert.equal(new Set(ids).size,61); assert.equal(third.nextCursor,null); assert.ok(ids.every(id=>id.startsWith('users/owner/')));
});

test('mixed timestamp formats and equal times paginate deterministically across inserts and deleted cursors', async t => {
  const f=await fixture(t),iso='2026-10-15T10:00:00.000Z';
  assert.equal((await f.db.query("select public.operational_notification_time('{\"createdAt\":\"2026-10-15T10:00:00+99:99\"}'::jsonb) as value")).rows[0].value,'0');
  await f.put('a',{createdAt:iso,type:'health'});
  await f.put('b',{createdAt:{__firestoreType:'timestamp',seconds:1792058400,nanoseconds:1,value:iso},type:'health'});
  await f.put('c',{createdAt:iso,type:'system'});
  await f.put('admin',{createdAt:iso,type:'health',source:'admin'});
  await f.put('invalid',{createdAt:'invalid',type:'health'});
  const first=await f.page('all',null,2); assert.deepEqual(first.rows.map(r=>r.path.split('/').at(-1)),['b','c']);
  await f.db.query('delete from public.operational_records where document_path=$1',[first.nextCursor.path]);
  await f.put('new',{createdAt:'2026-10-16T10:00:00Z',type:'health'});
  const second=await f.page('all',first.nextCursor,2); assert.deepEqual(second.rows.map(r=>r.path.split('/').at(-1)),['admin','a']);
  assert.equal((await f.page('system')).rows.length,1);
  assert.deepEqual((await f.page('alerts')).rows.map(r=>r.path.split('/').at(-1)),['new','b','a','invalid']);
});

test('bulk actions include unloaded notifications, preserve dates and isolate owners', async t => {
  const f=await fixture(t);
  for(let i=0;i<60;i++) await f.put(String(i),{createdAt:'2026-10-15T00:00:00Z',isRead:false,type:'health'});
  await f.put('foreign',{createdAt:'2026-10-15T00:00:00Z',isRead:false},'other');
  assert.equal((await f.bulk('markRead')).changed,60); assert.equal((await f.page()).unreadCount,0);
  assert.equal((await f.db.query("select data->>'createdAt' as created,revision from public.operational_records where document_path='users/owner/notifications/0'")).rows[0].created,'2026-10-15T00:00:00Z');
  assert.equal((await f.page('all',null,25,'other')).unreadCount,1);
  assert.equal((await f.bulk('clear')).changed,60); assert.equal((await f.page()).rows.length,0);
  assert.equal((await f.page('all',null,25,'other')).rows.length,1);
});

test('pagination RPCs reject invalid input and remain unavailable to browser database roles', async t => {
  const f=await fixture(t);
  for(const size of [0,51]) await assert.rejects(f.page('all',null,size),e=>e.code==='22023');
  await assert.rejects(f.page('unknown'),e=>e.code==='22023'); await assert.rejects(f.bulk('other'),e=>e.code==='22023');
  await assert.rejects(f.page('all',{time:'bad',path:'users/owner/notifications/x'}),e=>e.code==='22023');
  await assert.rejects(f.page('all',{time:'0',path:'users/other/notifications/x'}),e=>e.code==='22023');
  await f.db.exec('set role anon'); await assert.rejects(f.page(),e=>e.code==='42501'); await assert.rejects(f.bulk('clear'),e=>e.code==='42501'); await f.db.exec('reset role');
  await f.db.exec('set role authenticated'); await assert.rejects(f.page(),e=>e.code==='42501'); await f.db.exec('reset role');
  await f.db.exec('update public.operational_migration_state set runtime_primary=false'); await assert.rejects(f.page(),e=>e.code==='55000'); await assert.rejects(f.bulk('markRead'),e=>e.code==='55000');
});

test('bulk notification actions reject accounts being deleted and preserve unrelated records',async t=>{
 const f=await fixture(t);await f.put('keep',{createdAt:'2026-10-15T00:00:00Z',isRead:false});
 await f.db.exec("insert into public.operational_records(document_path,owner_id,data) values('users/owner/settings/default','owner','{}'),('deleteRequests/request','owner','{\"userId\":\"owner\",\"status\":\"deleting\"}');");
 await assert.rejects(f.bulk('clear'),e=>e.code==='42501');assert.equal((await f.page()).totalCount,1);
 await f.db.exec("delete from public.operational_records where document_path='deleteRequests/request'");await f.bulk('clear');
 assert.equal((await f.db.query("select count(*)::int n from public.operational_records where document_path='users/owner/settings/default'")).rows[0].n,1);
});
