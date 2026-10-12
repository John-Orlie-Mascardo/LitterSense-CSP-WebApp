import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function fixture(){
 const records=new Map(); const exports={};
 class OperationalError extends Error { constructor(message,status=503){super(message);this.status=status;} }
 const imports={ 'node:crypto':awaitCrypto, '@/lib/server/operationalCats':{resolveOperationalDevice:async token=>{if(token!=='valid')throw new OperationalError('Unknown device',403); return 'owner';}}, '@/lib/server/operationalStore':{OperationalError,readOperationalRecord:async(uid,path)=>records.get(path)||null,retryOperational:async work=>work(),setOperational:(path,previous,data)=>({path,data}),commitOperational:async(uid,changes)=>{for(const c of changes)records.set(c.path,{data:c.data});}} };
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./sensorEventHistory.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:n=>imports[n],Date,JSON,Number,Error});
 return {save:exports.saveSensorEventHistory,records};
}
import * as awaitCrypto from 'node:crypto';
const event={eventId:'boot_1',capturedAt:'2026-10-12T01:00:00.000Z',mq135Raw:0,mq136Raw:1,distanceCm:20,entranceOccupied:true};
test('history authenticates device and acknowledges identical retry without duplicate storage',async()=>{const f=fixture();await assert.rejects(f.save('wrong',{deviceId:'gas',events:[event]}));assert.deepEqual(Array.from(await f.save('valid',{deviceId:'gas',events:[event]})),['boot_1']);await f.save('valid',{deviceId:'gas',events:[event]});assert.equal(f.records.size,1);assert.ok([...f.records.keys()].every(p=>p.startsWith('users/owner/sensorHistory/')));});
test('conflicting ID, future timestamp and malformed samples fail without changing history',async()=>{const f=fixture();await f.save('valid',{deviceId:'gas',events:[event]});await assert.rejects(f.save('valid',{deviceId:'gas',events:[{...event,mq135Raw:1}]}));await assert.rejects(f.save('valid',{deviceId:'gas',events:[{...event,eventId:'bad',distanceCm:-1}]}));await assert.rejects(f.save('valid',{deviceId:'gas',events:[{...event,eventId:'future',capturedAt:'2099-01-01T00:00:00Z'}]}));assert.equal(f.records.size,1);});
test('unknown original time remains null rather than being replaced with receive time',async()=>{const f=fixture();await f.save('valid',{deviceId:'gas',events:[{...event,capturedAt:null}]});assert.equal([...f.records.values()][0].data.capturedAt,null);});
