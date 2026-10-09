import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
function fixture() {
  const calls=[]; let activate; let token='old-device'; let failRemove=false;
  const registration={active:{state:'activated'},showNotification:async(title)=>calls.push(`show:${title}`)};
  const ready=new Promise(resolve=>{activate=()=>resolve(registration);});
  const auth={currentUser:{uid:'owner',getIdToken:async()=>'auth'}};
  const exports={};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./firebaseMessaging.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
    exports,require:name=>name==='firebase/messaging'?{isSupported:async()=>true,getMessaging:()=>({}),getToken:async(_m,options)=>{calls.push('token');assert.equal(options.serviceWorkerRegistration,registration);return token;},deleteToken:async()=>{calls.push('delete');token='new-device';return true;}}:{auth,app:{}},
    navigator:{serviceWorker:{register:async()=>{calls.push('register');return registration;},ready,getRegistration:async()=>registration}},Notification:{permission:'granted'},
    process:{env:{NEXT_PUBLIC_FIREBASE_VAPID_KEY:'public-key'}},fetch:async(_url,init)=>{const data=JSON.parse(init.body);calls.push(`${data.remove?'remove':'save'}:${data.token}`);return Response.json({}, {status:failRemove&&data.remove?503:200});},Response,AbortSignal,setTimeout,clearTimeout,console,
  });
  return{api:exports,calls,activate,auth,set failRemove(v){failRemove=v;}};
}
test('push enrollment waits for an active worker before obtaining and saving its token',async()=>{
 const f=fixture();const pending=f.api.getFirebaseMessagingToken();await setImmediate();assert.deepEqual(f.calls,['register']);f.activate();assert.equal(await pending,'old-device');assert.deepEqual(f.calls,['register','token','save:old-device']);
});
test('reconnect replaces only the current device token after removing its previous registration',async()=>{
 const f=fixture();f.activate();assert.equal(await f.api.reconnectFirebaseMessagingToken(),'new-device');assert.ok(f.calls.indexOf('remove:old-device')<f.calls.indexOf('delete'));assert.ok(f.calls.includes('save:new-device'));
});
test('failed registration removal leaves the device subscription intact for a retry',async()=>{
 const f=fixture();f.activate();f.failRemove=true;await assert.rejects(f.api.reconnectFirebaseMessagingToken(),/Unable to/);assert.ok(!f.calls.includes('delete'));
});
test('a local system notification check uses the active worker without sending a server push',async()=>{
 const f=fixture();f.activate();await f.api.checkSystemNotification();assert.ok(f.calls.includes('show:LitterSense notification check'));assert.ok(!f.calls.includes('token'));assert.ok(!f.calls.some(v=>v.startsWith('save:')));
});
