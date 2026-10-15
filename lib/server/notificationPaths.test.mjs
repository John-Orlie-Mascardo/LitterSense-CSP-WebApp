import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function fixture(){
 const rows=new Map(),lookups=[];
 const store={
  OperationalError:class extends Error{constructor(message,status=503){super(message);this.status=status;}},
  assertOperationalReady:async()=>{},assertOperationalFoundation:async()=>{},
  readOperationalRecord:async(uid,path)=>{lookups.push({uid,path});return rows.get(path)??null;},
  listOperationalRecords:async(uid,prefix)=>[...rows.values()].filter(r=>r.owner_id===uid&&r.document_path.startsWith(prefix)),
  retryOperational:async work=>work(),
  setOperational:(path,previous,data)=>({action:'set',document_path:path,data,expected_revision:previous?.revision??0}),
  commitOperational:async(uid,changes)=>{for(const c of changes){if(c.action==='delete')rows.delete(c.document_path);else rows.set(c.document_path,{document_path:c.document_path,owner_id:uid,data:c.data,revision:(rows.get(c.document_path)?.revision??0)+1});}},
 };
 const smsStoreRequest=async(url,init)=>{
  assert.equal(url,'rpc/operational_read_records');
  const {p_owner_id:uid,p_path:path,p_list:list,p_offset:offset}=JSON.parse(init.body);
  lookups.push({uid,path});
  const found=[...rows.values()].filter(row=>row.owner_id===uid&&(list?row.document_path.startsWith(path+'/'):row.document_path===path));
  return Response.json(found.slice(offset,offset+500));
 };
 const exports={};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./operationalRecords.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports,require:name=>name==='./operationalStore'?store:name==='./operationalMedia'?{refreshPhotos:async data=>data,storePhotoPointers:data=>data}:name==='@/lib/utils/smsAccountSync'?{smsStoreRequest}:{},console,Date,Set,Map,Response,
 });
 return {api:exports,rows,lookups};
}

test('existing encoded health notification ID saves, reads, marks read and stays one record on retry',async()=>{
 const f=fixture(),identity={uid:'owner'},id=encodeURIComponent('dashboard-abnormal:2026-10-13:cat:abnormal'),path=`users/owner/notifications/${id}`;
 await f.api.writeClientRecords(identity,[{path,action:'set',data:{title:'Mochi - Abnormal Behavior',isRead:false}}]);
 await f.api.writeClientRecords(identity,[{path,action:'update',data:{isRead:true}}]);
 await f.api.writeClientRecords(identity,[{path,action:'update',data:{title:'Mochi - Abnormal Behavior'}}]);
 assert.equal(f.rows.size,1);assert.equal(f.rows.get(path).data.isRead,true);
 assert.equal((await f.api.readClientRecords(identity,path,false))[0].path,path);
 assert.ok(f.lookups.every(v=>v.path===path),'ID remains literal and is not decoded into another path');
 await f.api.writeClientRecords(identity,[{path:'users/owner/notifications/gas_alert_1',action:'set',data:{source:'ammonia_alert'}}]);
 assert.equal((await f.api.readClientRecords(identity,'users/owner/notifications',true)).length,2);
 await f.api.writeClientRecords(identity,[{path,action:'delete'}]);assert.equal(f.rows.size,1);
});

test('encoded IDs do not weaken owner checks, collection prefixes or other path validation',async()=>{
 const f=fixture(),identity={uid:'owner'};
 await assert.rejects(f.api.accessRecord(identity,'users/other/notifications/alert%3Aday',true),/Forbidden/);
 for(const path of ['users/owner/notifications/alert%','users/owner/notifications/alert%ZZ','users/owner/notifications/alert%3aday','users/owner/notifications/%2E%2E','users/owner/notifications/alert*','users/owner/notifications%3Aday','users/owner/reports/alert%3Aday','users/owner/notifications/alert%3Aday/child/item','users/owner/notifications/a\u0000']){
  await assert.rejects(f.api.accessRecord(identity,path,true),/Invalid record path/,path);
 }
 assert.equal(f.rows.size,0);
});

