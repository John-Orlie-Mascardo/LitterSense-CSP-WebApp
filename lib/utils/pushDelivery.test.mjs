import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const templates = require('./smsTemplates.ts');
function load(path, imports) {
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: loaded, exports: loaded.exports, require: name => name === './smsTemplates' ? templates : name === 'node:crypto' ? crypto : imports[name], Date, Intl, console });
  return loaded.exports;
}
const sms = load('./smsDelivery.ts', {});
test('push works without a profile phone, respects preferences and removes only expired tokens', async () => {
  const patches=[]; const removed=[]; let claimed=false; let sends=0;
  const record={ id:'event',owner_id:'owner',cat_id:'cat',reason:'Extended duration',event_key:'unique',context:{durationSecs:300},created_at:'2026-10-05T08:05:00Z' };
  const account={ fcm_tokens:['valid-device','expired-device'],phone_number:'',notifications:{},cats:[{id:'cat',name:'Zeno'}] };
  const helper=load('./pushDelivery.ts', {
    './smsDelivery':sms,
    'firebase-admin/firestore':{FieldValue:{arrayRemove:(...tokens)=>tokens}},
    '@/lib/configs/firebase-admin':{getAdminAuth:()=>({getUser:async()=>({disabled:false})}),getAdminFirestore:()=>({doc:()=>({update:async value=>removed.push(value)})}),getAdminMessaging:()=>({sendEachForMulticast:async value=>{ sends++; assert.equal(value.tokens.length,sends===1?2:1); assert.match(value.notification.body,/Zeno stayed/); return {successCount:1,responses:[{success:true},{error:{code:'messaging/registration-token-not-registered'}}]}; }})},
    './smsAccountSync':{smsStoreRequest:async(path,init={})=>{
      if(path==='rpc/claim_push_outbox'){const rows=claimed?[]:[record];claimed=true;return Response.json(rows);}
      if(path.startsWith('sms_accounts?'))return Response.json([account]);
      if(init.method==='PATCH')patches.push(JSON.parse(init.body));
      if(path==='rpc/register_push_token')removed.push(JSON.parse(init.body));
      return new Response(null,{status:204});
    }},
  });
  assert.equal(helper.pushDeliveryDecision(account,record),'send');
  assert.equal(helper.pushDeliveryDecision({...account,notifications:{healthAlerts:false}},record),'cancel');
  assert.equal(helper.pushDeliveryDecision({...account,notifications:{quietHours:{enabled:true,from:'00:00',to:'00:00'}}},record),'defer');
  assert.equal(helper.pushDeliveryDecision(account,{...record,reason:'Saved notification',context:{source:'rfid_visit'}}),'cancel');
  assert.equal(helper.invalidPushToken('messaging/internal-error'),false);
  await helper.processPushOutbox('owner'); await helper.processPushOutbox('owner');
  assert.equal(sends,1); assert.equal(patches[0].push_status,'sent'); assert.equal(removed[0].p_token,'expired-device');
  record.context.targetTokenHash=crypto.createHash('sha256').update('valid-device').digest('hex');
  claimed=false; await helper.processPushOutbox('owner'); assert.equal(sends,2);
});

