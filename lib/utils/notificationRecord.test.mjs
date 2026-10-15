import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {Timestamp} from 'firebase/firestore';
const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync('lib/utils/notificationRecord.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>name.endsWith('/operationalClient')?{Timestamp}:{ownerText:value=>value},Date});
test('notification record decoding preserves exact IDs and timestamp nanos without crashing on malformed history',()=>{
 const decode=createdAt=>exports.notificationFromRecord({path:'users/owner/notifications/alert%3Aold',data:{title:'Title',message:'Message',createdAt}});
 const stamp={seconds:1792058400,nanoseconds:123456789};assert.equal(decode(stamp).createdAt.nanoseconds,123456789);assert.equal(decode(stamp).id,'alert%3Aold');
 assert.equal(decode('2026-10-15T10:00:00.000Z').createdAt.toMillis(),1792058400000);
 for(const malformed of ['bad',{seconds:1792058400,nanoseconds:1000000000},{seconds:9999999999999,nanoseconds:0},'99999-01-01T00:00:00Z',null]) assert.equal(decode(malformed).createdAt.toMillis(),0);
});
