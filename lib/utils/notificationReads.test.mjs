import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require=createRequire(import.meta.url);
const path='lib/utils/notificationReads.ts';
function load(){assert.ok(existsSync(path),'Immediate read-state helper missing');return require('./notificationReads.ts');}
test('read click updates before network resolves and stale snapshots cannot restore unread state',async()=>{
 const {markNotificationIdsRead,reconcileNotificationReads}=load(),pending=new Set();let finish,local=[];
 const network=new Promise(resolve=>finish=resolve);
 const result=markNotificationIdsRead([{id:'one',isRead:false}],pending,ids=>local=ids,()=>{},async()=>network);
 assert.deepEqual(local,['one']);assert.equal(reconcileNotificationReads([{id:'one',isRead:false},{id:'new',isRead:false}],pending)[0].isRead,true);
 assert.equal(reconcileNotificationReads([{id:'new',isRead:false}],pending)[0].isRead,false);finish();await result;
 assert.equal(pending.has('one'),true);reconcileNotificationReads([{id:'one',isRead:true}],pending);assert.equal(pending.size,0);
});
test('failed persistence rolls back only unconfirmed changes and reports error',async()=>{
 const {markNotificationIdsRead,reconcileNotificationReads}=load(),pending=new Set();let rolled=[];
 await assert.rejects(markNotificationIdsRead([{id:'one',isRead:false},{id:'confirmed',isRead:false}],pending,()=>{},ids=>rolled=ids,async()=>{reconcileNotificationReads([{id:'confirmed',isRead:true}],pending);throw Error('Offline');}));
 assert.deepEqual(rolled,['one']);assert.equal(pending.size,0);
});

test('a later batch failure leaves successfully committed reads marked read',async()=>{
 const {markNotificationIdsRead}=load(),pending=new Set();let rolled=[];
 await assert.rejects(markNotificationIdsRead([{id:'saved',isRead:false},{id:'failed',isRead:false}],pending,()=>{},ids=>rolled=ids,async(ids,committed)=>{
  committed.add(ids[0]);throw Error('Second batch failed');
 }));
 assert.deepEqual(rolled,['failed']);assert.deepEqual([...pending],['saved']);
});


test('opening an already-read row never persists or rolls it back as unread',async()=>{
 const {markNotificationIdsRead}=load(),pending=new Set();let updated=false,persisted=false;
 await markNotificationIdsRead([{id:'read',isRead:true}],pending,()=>updated=true,()=>updated=true,async()=>{persisted=true;throw Error('Offline');});
 assert.equal(updated,false);assert.equal(persisted,false);assert.equal(pending.size,0);
});
