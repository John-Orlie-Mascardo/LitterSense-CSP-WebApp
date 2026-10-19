import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {Timestamp} from 'firebase/firestore';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync('lib/utils/notificationRecord.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>name.endsWith('/operationalClient')?{Timestamp}:require('../presentation/ownerText.ts'),Date});
test('notification record decoding preserves exact IDs and timestamp nanos without crashing on malformed history',()=>{
 const decode=createdAt=>exports.notificationFromRecord({path:'users/owner/notifications/alert%3Aold',data:{title:'Title',message:'Message',createdAt}});
 const stamp={seconds:1792058400,nanoseconds:123456789};assert.equal(decode(stamp).createdAt.nanoseconds,123456789);assert.equal(decode(stamp).id,'alert%3Aold');
 assert.equal(decode('2026-10-15T10:00:00.000Z').createdAt.toMillis(),1792058400000);
 for(const malformed of ['bad',{seconds:1792058400,nanoseconds:1000000000},{seconds:9999999999999,nanoseconds:0},'99999-01-01T00:00:00Z',null]) assert.equal(decode(malformed).createdAt.toMillis(),0);
});

test('live and saved gas rows share dated wording without changing identity, route or read state',()=>{
 const messages=['Odor detected near the litter box. Check the litter box and ventilation.','Saved gas detection at Oct 19, 2026, 3:35:28 PM. Uploaded after the event; check gas history for the recorded readings.'];
 for(const [source,title] of [['ammonia_alert','Urine detected'],['h2s_alert','Stool detected']]) for(const [index,message] of messages.entries()){
  const data={type:'health',source,title:`LitterSense: ${title} (saved detection)`,message,createdAt:'2026-10-19T07:35:28.000Z',eventId:'original-event',isRead:true,route:index?'/dashboard/history':'/dashboard'};
  const result=exports.notificationFromRecord({path:'users/owner/notifications/gas_original',revision:3,data});
  assert.equal(result.title,title);
  assert.equal(result.message,'Odor detected at Oct 19, 2026, 3:35 PM. Check the litter box and ventilation.');
  assert.equal(result.createdAt.toMillis(),1792395328000);
  assert.equal(result.id,'gas_original');assert.equal(result.eventId,'original-event');assert.equal(result.isRead,true);assert.equal(result.route,data.route);
  assert.equal(data.message,message,'presentation must not rewrite stored input');
 }
});

test('gas formatting handles imported timestamp markers and never invents a missing event time',()=>{
 for(const stamp of [{__firestoreType:'timestamp',value:'2026-10-18T16:05:00.000Z'},{seconds:1792339500,nanoseconds:123456789}]){
  const result=exports.notificationFromRecord({path:'users/owner/notifications/gas',data:{source:'ammonia_alert',createdAt:stamp}});
  assert.equal(result.message,'Odor detected at Oct 19, 2026, 12:05 AM. Check the litter box and ventilation.');
 }
 for(const createdAt of ['bad',null,undefined,{seconds:123,nanoseconds:1000000000}]){
  const result=exports.notificationFromRecord({path:'users/owner/notifications/gas',data:{source:'h2s_alert',createdAt}});
  assert.match(result.message,/Detection time unavailable/);assert.doesNotMatch(result.message,/1970|Invalid Date/);
 }
 const unrelated=exports.notificationFromRecord({path:'users/owner/notifications/other',data:{source:'system',title:'System notice',message:'Other timestamp 21:29:06 (UTC+08:00).',createdAt:'2026-10-19T07:35:00Z'}});
 assert.equal(unrelated.message,'Other timestamp 21:29:06 (UTC+08:00).');
});
