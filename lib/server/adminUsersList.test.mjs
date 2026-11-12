import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Fake PostgREST: supports eq/like/not.like on document_path and caps every response at 1000 rows, like the real server.
function fakeStore(rows){
 const like=(pattern,value)=>new RegExp(`^${pattern.split('*').map(s=>s.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*')}$`).test(value);
 return async url=>{
  const params=new URLSearchParams(url.split('?')[1]);
  let found=[...rows];
  for(const filter of params.getAll('document_path')){
   const [op,...rest]=filter.split('.');const value=rest.join('.');
   found=found.filter(r=>op==='eq'?r.document_path===value:op==='like'?like(value,r.document_path):op==='not'&&value.startsWith('like.')?!like(value.slice(5),r.document_path):true);
  }
  found.sort((a,b)=>a.document_path<b.document_path?-1:1);
  return Response.json(found.slice(0,Math.min(Number(params.get('limit')??1000),1000)));
 };
}

function load(rows){
 const exports={};
 const store={OperationalError:class extends Error{constructor(m,s=503){super(m);this.status=s;}},assertOperationalReady:async()=>{},assertOperationalFoundation:async()=>{}};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./operationalRecords.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports,require:n=>n==='./operationalStore'?store:n==='./operationalMedia'?{refreshPhotos:async d=>d,storePhotoPointers:d=>d}:n==='@/lib/utils/smsAccountSync'?{smsStoreRequest:fakeStore(rows)}:{},console,Date,Set,Map,Response,URLSearchParams,
 });
 return exports;
}

test('admin users list returns every profile even when their subcollections exceed the 1000-row response cap',async()=>{
 const rows=[];
 for(let u=0;u<40;u++){
  const uid=`user${String(u).padStart(2,'0')}`;
  rows.push({document_path:`users/${uid}`,owner_id:uid,data:{email:`${uid}@x.com`},revision:1});
  for(let s=0;s<100;s++)rows.push({document_path:`users/${uid}/sessions/s${String(s).padStart(3,'0')}`,owner_id:uid,data:{},revision:1});
 }
 const users=await load(rows).readClientRecords({uid:'admin',admin:true},'users',true);
 assert.equal(users.length,40);
 assert.ok(users.every(u=>/^users\/[^/]+$/.test(u.path)));
});
