import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const path='lib/server/gasHistory.ts';
function fixture(rows=[]){
 assert.ok(existsSync(path),'Authenticated gas history reader missing');
 const exports={},requests=[];
 class OperationalError extends Error {constructor(message,status){super(message);this.status=status;}}
 vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:n=>n.includes('smsAccountSync')?{smsStoreRequest:async query=>{requests.push(query);return Response.json(rows);}}:{OperationalError,assertOperationalReady:async()=>{}},Buffer,Date,URLSearchParams});
 return {...exports,requests};
}
test('gas history read is owner-scoped, bounded, newest receipts first with original capture times',async()=>{
 const rows=Array.from({length:51},(_,i)=>({document_path:`users/owner/sensorHistory/${String(i).padStart(64,'a')}`,updated_at:'2026-10-12T12:19:34.123456Z',data:{capturedAt:'2026-10-12T12:17:55Z',mq135Raw:0,mq136Raw:1}}));
 const f=fixture(rows),page=await f.readGasHistory('owner');assert.equal(page.events.length,50);assert.ok(page.nextCursor);assert.equal(page.events[0].capturedAt,rows[0].data.capturedAt);
 const q=new URLSearchParams(f.requests[0].split('?')[1]);assert.equal(q.get('owner_id'),'eq.owner');assert.equal(q.get('limit'),'51');assert.equal(q.get('data->>source'),'eq.gas-ultrasonic');
 await f.readGasHistory('owner',page.nextCursor);assert.match(new URLSearchParams(f.requests[1].split('?')[1]).get('or'), /\.123456Z/);
 await assert.rejects(f.readGasHistory('other',page.nextCursor));await assert.rejects(f.readGasHistory('owner','bad'));
});
