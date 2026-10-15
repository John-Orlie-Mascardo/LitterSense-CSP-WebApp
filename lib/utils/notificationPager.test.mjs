import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function fixture() {
  const exports={},timers=[],seen=[],calls=[];
  const file='lib/utils/notificationPager.ts';
  if(existsSync(file)) vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},clearTimeout(){},Map,Set});
  let rows=Array.from({length:61},(_,i)=>({path:`users/owner/notifications/${String(100-i).padStart(3,'0')}`,revision:1,data:{isRead:i>=40}}));
  const read=async cursor=>{calls.push(cursor);const start=cursor?rows.findIndex(row=>row.path<cursor.path):0;const slice=start<0?[]:rows.slice(start,start+25);return {rows:slice,unreadCount:40,totalCount:rows.length,nextCursor:start>=0&&start+25<rows.length?{time:'1',path:slice.at(-1).path}:null};};
  assert.equal(typeof exports.createNotificationPager,'function','paginated feed controller must exist');
  return {create:(reader=read)=>exports.createNotificationPager(reader,state=>seen.push(state)),seen,calls,timers,setRows:value=>{rows=value;},getRows:()=>rows};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('notification feed loads only the newest page until older pages are requested and refreshes without boundary gaps',async()=>{
  const f=fixture(),pager=f.create();await flush();
  assert.equal(f.calls.length,1);assert.equal(f.seen.at(-1).rows.length,25);assert.equal(f.seen.at(-1).unreadCount,40);assert.equal(f.timers.at(-1).delay,30000);
  await pager.loadMore();assert.equal(f.seen.at(-1).rows.length,50);assert.equal(f.calls.length,3);
  f.setRows([{path:'users/owner/notifications/101',data:{isRead:false}},...f.getRows()]);
  await pager.refresh();assert.equal(f.seen.at(-1).rows.length,50);assert.equal(f.seen.at(-1).rows[0].path,'users/owner/notifications/101');
  assert.equal(f.seen.at(-1).rows.at(-1).path,'users/owner/notifications/052');
  await pager.loadMore();assert.equal(f.seen.at(-1).rows.length,62);assert.equal(f.seen.at(-1).hasMore,false);
  const before=f.calls.length;await pager.loadMore();assert.equal(f.calls.length,before);pager.stop();
});

test('notification feed ignores stale in-flight responses after invalidation and stops after account cleanup',async()=>{
  const f=fixture(),waiting=[];
  const pager=f.create(()=>new Promise(resolve=>waiting.push(resolve)));
  await flush();void pager.refresh();
  waiting.shift()({rows:[{path:'old'}],unreadCount:1,totalCount:1,nextCursor:null});await flush();
  assert.equal(f.seen.some(state=>state.rows.some(row=>row.path==='old')),false);
  waiting.shift()({rows:[{path:'new'}],unreadCount:2,totalCount:1,nextCursor:null});await flush();
  assert.equal(f.seen.at(-1).rows[0].path,'new');
  void pager.refresh();await flush();pager.stop();const before=f.seen.length;
  waiting.shift()({rows:[{path:'private'}],unreadCount:9,totalCount:1,nextCursor:null});await flush();assert.equal(f.seen.length,before);
});

test('notification feed retains prior records on failure and retries without pretending history is empty',async()=>{
  const f=fixture();let failure=false;
  const pager=f.create(async()=>{if(failure)throw new Error('Offline');return {rows:[{path:'kept'}],unreadCount:3,totalCount:1,nextCursor:null};});
  await flush();failure=true;await pager.refresh();assert.equal(f.seen.at(-1).rows[0].path,'kept');assert.ok(f.seen.at(-1).error);assert.equal(f.timers.at(-1).delay,60000);
  failure=false;await pager.refresh();assert.equal(f.seen.at(-1).error,'');pager.stop();
});
