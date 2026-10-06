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
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: loaded, exports: loaded.exports, require: name => name === '@/lib/presentation/ownerText' ? require('../presentation/ownerText.ts') : name === './smsTemplates' ? templates : name === 'node:crypto' ? crypto : imports[name], Date, Intl, console });
  return loaded.exports;
}
const sms = load('./smsDelivery.ts', {});
test('both gases send without a browser or phone number, with urgency and per-device acceptance evidence', async () => {
  const records = ['Ammonia detected', 'Hydrogen sulfide detected'].map((reason, index) => ({ id: `gas-${index}`, owner_id: 'owner', cat_id: null, reason, event_key: `gas-${index}`, context: { title: reason === 'Ammonia detected' ? 'LitterSense: Ammonia (NH3) detected' : 'LitterSense: Hydrogen sulfide (H2S) detected' }, created_at: new Date().toISOString() }));
  const account = { fcm_tokens: ['pc-device', 'phone-device'], phone_number: '', notifications: { ammoniaAlerts: true, h2sAlerts: true }, cats: [] };
  const sends = []; const patches = [];
  const helper = load('./pushDelivery.ts', {
    './smsDelivery': sms,
    'firebase-admin/firestore': {},
    '@/lib/configs/firebase-admin': { getAdminAuth: () => ({ getUser: async () => ({ disabled: false }) }), getAdminMessaging: () => ({ sendEachForMulticast: async value => { sends.push(value); return { successCount: 1, responses: [{ success: true }, { success: false, error: { code: 'messaging/unavailable' } }] }; } }) },
    './smsAccountSync': { smsStoreRequest: async (path, init = {}) => {
      if (path === 'rpc/claim_push_outbox') return Response.json(records);
      if (path.startsWith('sms_accounts?')) return Response.json([account]);
      if (init.method === 'PATCH') patches.push(JSON.parse(init.body));
      return new Response(null, { status: 204 });
    } },
  });
  await helper.processPushOutbox('owner');
  assert.equal(sends.length, 2);
  assert.equal(sends[0].notification.title, 'LitterSense: Urine detected');
  assert.equal(sends[1].notification.title, 'LitterSense: Stool detected');
  assert.match(sends[0].notification.body, /Urine odor/);
  assert.match(sends[1].notification.body, /Stool odor/);
  for (const send of sends) {
    assert.equal(send.webpush.headers.Urgency, 'high');
    assert.equal(send.webpush.headers.TTL, '3600');
    assert.deepEqual(Array.from(send.tokens), account.fcm_tokens);
  }
  for (const patch of patches) {
    assert.equal(patch.push_status, 'sent');
    assert.equal(patch.context.pushDelivery.devices[0].accepted, true);
    assert.equal(patch.context.pushDelivery.devices[1].accepted, false);
    assert.equal(patch.context.pushDelivery.devices[1].errorCode, 'messaging/unavailable');
    assert.equal(patch.context.pushDelivery.devices[1].tokenHash, crypto.createHash('sha256').update('phone-device').digest('hex'));
    assert.ok(!JSON.stringify(patch).includes('phone-device'));
  }
  assert.equal(helper.pushDeliveryDecision({ ...account, notifications: { ammoniaAlerts: false } }, records[0]), 'cancel');
  assert.equal(helper.pushDeliveryDecision({ ...account, notifications: { h2sAlerts: false } }, records[1]), 'cancel');
});
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

