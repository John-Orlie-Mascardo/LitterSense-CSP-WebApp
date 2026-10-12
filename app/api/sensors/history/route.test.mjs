import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function fixture(){
 const exports={},calls=[],callbacks=[];
 class OperationalError extends Error{constructor(message,status=503){super(message);this.status=status;}}
 const imports={
  '@/lib/server/sensorEventHistory':{saveSensorEventHistory:async()=>{calls.push('save');return ['event'];}},
  '@/lib/server/operationalStore':{OperationalError,rfidPrimaryEnabled:()=>true},
  '@/lib/configs/firebase-admin':{getAdminAuth:()=>({verifyIdToken:async token=>{if(token!=='valid') throw Error();return {uid:'owner'};}})},
  '@/lib/server/gasHistory':{readGasHistory:async(uid,cursor)=>{calls.push({uid,cursor});return {events:[],nextCursor:null};}},
  '@/lib/server/operationalCats':{resolveOperationalDevice:async()=>{calls.push('owner');return 'owner';}},
  '@/lib/utils/pushDelivery':{processPushOutbox:async uid=>calls.push(`push:${uid}`)},
  'next/server':{after:callback=>callbacks.push(callback)},
 };
 vm.runInNewContext(ts.transpileModule(readFileSync('app/api/sensors/history/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:n=>{assert.ok(imports[n],`Unexpected import ${n}`);return imports[n];},URL,Response,Buffer,console});
 return {...exports,calls,callbacks};
}
test('history GET rejects anonymous and scopes valid read to verified owner rather than query input',async()=>{
 const f=fixture();assert.equal((await f.GET(new Request('https://test/api/sensors/history'))).status,401);
 const r=await f.GET(new Request('https://test/api/sensors/history?owner=other',{headers:{Authorization:'Bearer valid'}}));assert.equal(r.status,200);assert.equal(f.calls[0].uid,'owner');assert.match(r.headers.get('cache-control'),/no-store/);
});
test('history ACK waits for durable save; push is background and uses verified device owner without invoking SMS',async()=>{
 const f=fixture();const r=await f.POST(new Request('https://test/api/sensors/history',{method:'POST',headers:{'x-device-config-token':'device'},body:JSON.stringify({source:'gas-ultrasonic',events:[{capturedAt:'2026-10-12T12:17:55Z'}]})}));
 assert.equal(r.status,200);assert.equal(r.headers.get('x-litersense-ack'),'event');assert.deepEqual(f.calls,['save']);assert.equal(f.callbacks.length,1);
 await f.callbacks[0]();assert.deepEqual(f.calls,['save','owner','push:owner']);
 const rfid=fixture();await rfid.POST(new Request('https://test/api/sensors/history',{method:'POST',body:JSON.stringify({source:'rfid'})}));assert.equal(rfid.callbacks.length,0);
});
