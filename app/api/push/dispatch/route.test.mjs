import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import crypto from 'node:crypto';
test('push tests belong to one registered device and report duplicate hourly tests honestly', async () => {
  const records=[];const keys=new Set();const devices=['pc-device-token-1234567890','phone-device-token-1234567890'];
  const imports={
    'node:crypto':crypto,
    'next/server':{after:()=>{}},
    '@/lib/configs/firebase-admin':{getAdminAuth:()=>({verifyIdToken:async()=>({uid:'owner'})})},
    '@/lib/utils/pushDelivery':{processPushOutbox:async()=>{}},
    '@/lib/utils/smsAccountSync':{smsStoreRequest:async(path,init={})=>{
      if(path.startsWith('sms_accounts?'))return Response.json([{fcm_tokens:devices}]);
      const record=JSON.parse(init.body);records.push(record);
      if(keys.has(record.event_key))return Response.json([]);
      keys.add(record.event_key);return Response.json([record]);
    }},
  };
  const loaded={exports:{}};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:loaded,exports:loaded.exports,require:name=>imports[name],Response,Date});
  const request=token=>new Request('https://test/api/push/dispatch',{method:'POST',headers:{Authorization:'Bearer good','Content-Type':'application/json'},body:JSON.stringify({test:true,token})});
  assert.equal((await loaded.exports.POST(request(devices[0]))).status,200);
  assert.equal((await loaded.exports.POST(request(devices[1]))).status,200);
  assert.notEqual(records[0].event_key,records[1].event_key);
  assert.equal(records[1].context.targetTokenHash,crypto.createHash('sha256').update(devices[1]).digest('hex'));
  assert.equal((await loaded.exports.POST(request(devices[1]))).status,429);
  assert.equal((await loaded.exports.POST(request('foreign-device-token-1234567890'))).status,403);
});
