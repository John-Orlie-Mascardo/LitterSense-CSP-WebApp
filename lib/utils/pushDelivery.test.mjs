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
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: loaded, exports: loaded.exports, require: name => name === '@/lib/presentation/ownerText' ? require('../presentation/ownerText.ts') : name === './smsTemplates' ? templates : name === 'node:crypto' ? crypto : (imports[name] ?? (name === "@/lib/server/operationalStore" ? { rfidPrimaryEnabled: () => false } : name === '@/lib/server/operationalAlertRecipients' ? { claimOperationalAlerts: async () => (await imports['./smsAccountSync'].smsStoreRequest('rpc/claim_push_outbox', { method: 'POST' })).json() } : undefined)), Date, Intl, console });
  return loaded.exports;
}
const sms = load('./smsDelivery.ts', {});

test('live and replayed gas pushes match bell text and retain occurrence time through system display and toast', async () => {
  const { Timestamp } = require('firebase/firestore');
  const { notificationFromRecord } = load('./notificationRecord.ts', { '@/lib/utils/operationalClient': { Timestamp } });
  const sends = [], records = [];
  for (const [reason, source, title] of [['Ammonia detected', 'ammonia_alert', 'Urine detected'], ['Hydrogen sulfide detected', 'h2s_alert', 'Stool detected']]) {
    for (const saved of [false, true]) records.push({ id: `${source}-${saved}`, owner_id: 'owner', cat_id: null, reason, event_key: `${source}-${saved}`, created_at: saved ? '2026-10-19T08:40:00.000Z' : '2026-10-19T07:35:28.000Z', context: { source: saved ? 'gas_history' : source, title: saved ? `${title} (saved detection)` : `LitterSense: ${reason}`, occurredAt: '2026-10-19T07:35:28.000Z', ...(saved ? { body: 'Saved gas detection at Oct 19, 2026, 3:35:28 PM. Uploaded after the event; check gas history for the recorded readings.' } : {}) } });
  }
  const helper = load('./pushDelivery.ts', {
    './smsDelivery': sms,
    '@/lib/configs/firebase-admin': { getAdminAuth: () => ({ getUser: async () => ({ disabled: false }) }), getAdminMessaging: () => ({ sendEachForMulticast: async value => { sends.push(value); return { successCount: 1, responses: [{ success: true }] }; } }) },
    './smsAccountSync': { smsStoreRequest: async (path, init = {}) => {
      if (path === 'rpc/claim_push_outbox') return Response.json(records);
      if (path.startsWith('sms_accounts?')) return Response.json([{ fcm_tokens: ['device'], phone_number: '', notifications: { ammoniaAlerts: true, h2sAlerts: true }, cats: [] }]);
      if (init.method === 'PATCH') return new Response(null, { status: 204 });
      throw new Error(`Unexpected request: ${path}`);
    } },
  });
  await helper.processPushOutbox('owner');
  assert.equal(sends.length, 4);
  const handlers = {}, shown = [], foreground = [];
  vm.runInNewContext(readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8'), { URL, location: { origin: 'https://test' }, addEventListener: (name, fn) => { handlers[name] = fn; }, registration: { showNotification: async (...args) => shown.push(args) }, clients: { matchAll: async () => [{ visibilityState: 'visible', postMessage: value => foreground.push(value) }] } });
  for (const [index, record] of records.entries()) {
    const title = index < 2 ? 'Urine detected' : 'Stool detected';
    const bell = notificationFromRecord({ path: `users/owner/notifications/${record.id}`, revision: 1, data: { source: index < 2 ? 'ammonia_alert' : 'h2s_alert', title: record.context.title, message: record.context.body ?? 'Odor detected near the litter box. Check the litter box and ventilation.', createdAt: record.context.occurredAt } });
    assert.equal(sends[index].notification.title, title);
    assert.equal(sends[index].notification.body, 'Odor detected at Oct 19, 2026, 3:35 PM. Check the litter box and ventilation.');
    assert.equal(bell.title, sends[index].notification.title);assert.equal(bell.message, sends[index].notification.body);
    assert.equal(sends[index].data.eventKey, record.event_key);
    let pending;
    handlers.push({ data: { json: () => sends[index] }, waitUntil: value => { pending = value; } });
    await pending;
    assert.equal(shown[index][0], title);assert.equal(shown[index][1].body, bell.message);
    assert.equal(foreground[index].title, title);assert.equal(foreground[index].body, bell.message);
  }
});

test('a saved gas push with missing occurrence time does not substitute its upload time',async()=>{
 const sends=[];
 const helper=load('./pushDelivery.ts',{
  './smsDelivery':sms,
  '@/lib/configs/firebase-admin':{getAdminAuth:()=>({getUser:async()=>({disabled:false})}),getAdminMessaging:()=>({sendEachForMulticast:async value=>{sends.push(value);return{successCount:1,responses:[{success:true}]};}})},
  './smsAccountSync':{smsStoreRequest:async(path,init={})=>{
   if(path==='rpc/claim_push_outbox')return Response.json([{id:'saved',owner_id:'owner',cat_id:null,reason:'Ammonia detected',event_key:'saved',context:{source:'gas_history'},created_at:'2026-10-19T08:40:00.000Z'}]);
   if(path.startsWith('sms_accounts?'))return Response.json([{fcm_tokens:['device'],phone_number:'',notifications:{},cats:[]}]);
   if(init.method==='PATCH')return new Response(null,{status:204});
   throw new Error(`Unexpected request: ${path}`);
  }},
 });
 await helper.processPushOutbox();assert.equal(sends.length,1);
 assert.equal(sends[0].notification.body,'Odor detected. Detection time unavailable. Check the litter box and ventilation.');
});

test('an unsent push survives a recipient outage and does not block another claimed owner', async () => {
  const patches = []; let sends = 0;
  const records = ['broken', 'healthy'].map(owner => ({ id: owner, owner_id: owner, cat_id: null, reason: 'Ammonia detected', event_key: owner, context: {}, created_at: new Date().toISOString() }));
  const helper = load('./pushDelivery.ts', {
    '@/lib/server/operationalStore': { rfidPrimaryEnabled: () => true },
    '@/lib/server/operationalRecords': { projectOperationalAccount: async uid => { if (uid === 'broken') throw new Error('Projection unavailable'); } },
    './smsDelivery': sms,
    '@/lib/configs/firebase-admin': { getAdminAuth: () => ({ getUser: async () => ({ disabled: false }) }), getAdminMessaging: () => ({ sendEachForMulticast: async () => { sends++; return { successCount: 1, responses: [{ success: true }] }; } }) },
    './smsAccountSync': { smsStoreRequest: async (path, init = {}) => {
      if (path === 'rpc/claim_push_outbox') return Response.json(records);
      if (init.method === 'PATCH') { patches.push({ path, ...JSON.parse(init.body) }); return new Response(null, { status: 204 }); }
      if (path.startsWith('sms_accounts?')) return Response.json([{ fcm_tokens: ['device'], phone_number: '', notifications: {}, cats: [] }]);
      throw new Error('Unexpected request');
    } },
  });
  await helper.processPushOutbox(); assert.equal(patches[0].push_status, 'pending'); assert.match(patches[0].path, /id=eq.broken/); assert.equal(sends, 1);
});
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
  assert.equal(sends[0].notification.title, 'Urine detected');
  assert.equal(sends[1].notification.title, 'Stool detected');
  for (const send of sends) assert.match(send.notification.body, /^Odor detected at .+\. Check the litter box and ventilation\.$/);
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
  assert.equal(helper.pushDeliveryDecision(account,{...record,reason:'Saved notification',context:{source:'dashboard_abnormal'}}),'send');
  assert.equal(helper.pushDeliveryDecision({...account,notifications:{healthAlerts:false}},{...record,reason:'Saved notification',context:{source:'dashboard_abnormal'}}),'cancel');
  assert.equal(helper.invalidPushToken('messaging/internal-error'),false);
  await helper.processPushOutbox('owner'); await helper.processPushOutbox('owner');
  assert.equal(sends,1); assert.equal(patches[0].push_status,'sent'); assert.equal(removed[0].p_token,'expired-device');
  record.context.targetTokenHash=crypto.createHash('sha256').update('valid-device').digest('hex');
  claimed=false; await helper.processPushOutbox('owner'); assert.equal(sends,2);
});



test('primary push worker refreshes canonical preferences before delivery even with no app open', async () => {
  let projected = false, sends = 0; const patches = [];
  const helper = load('./pushDelivery.ts', {
    '@/lib/server/operationalStore': { rfidPrimaryEnabled: () => true },
    '@/lib/server/operationalRecords': { projectOperationalAccount: async uid => { assert.equal(uid, 'owner'); projected = true; } },
    './smsDelivery': sms,
    '@/lib/configs/firebase-admin': { getAdminMessaging: () => ({ sendEachForMulticast: async () => { sends++; } }) },
    './smsAccountSync': { smsStoreRequest: async (path, init = {}) => {
      if (path === 'rpc/claim_push_outbox') return Response.json([{ id: 'gas', owner_id: 'owner', cat_id: null, reason: 'Ammonia detected', context: {}, created_at: new Date().toISOString() }]);
      if (path.startsWith('sms_accounts?')) { assert.equal(projected, true); return Response.json([{ fcm_tokens: ['device'], phone_number: '', notifications: { ammoniaAlerts: false }, cats: [] }]); }
      if (init.method === 'PATCH') patches.push(JSON.parse(init.body));
      return new Response(null, { status: 204 });
    } },
  });
  await helper.processPushOutbox('owner'); assert.equal(sends, 0); assert.equal(patches[0].push_status, 'cancelled');
});
