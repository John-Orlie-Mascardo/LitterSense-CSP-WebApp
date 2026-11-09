import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require=createRequire(import.meta.url);
function loadGroups(){const m={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync('lib/presentation/gasHistoryGroups.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports});return m.exports;}
function renderWith(events){
 const exports={};const state={uid:'owner',events,nextCursor:null,error:'',loading:false};
 vm.runInNewContext(ts.transpileModule(readFileSync('components/history/GasSensorHistory.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>n==='react'?{...React,useState:init=>typeof init==='number'?[init,()=>{}]:[state,()=>{}],useEffect:()=>{},useRef:()=>({current:()=>{}})}:n==='next/link'?{default:props=>React.createElement('a',props)}:n.includes('AuthContext')?{useAuth:()=>({user:{uid:'owner'}})}:n.includes('notificationLive')?{}:n.includes('gasHistoryGroups')?loadGroups():require(n)});
 return renderToStaticMarkup(React.createElement(exports.GasSensorHistory,{preview:false}));
}
function render(preview=false,uid='owner'){
 const exports={};const state={uid:'owner',events:[{id:'saved',capturedAt:'2026-10-12T12:17:55Z',receivedAt:'2026-10-12T12:19:34Z',mq135Raw:0,mq136Raw:1},{id:'unknown',capturedAt:null,receivedAt:'2026-10-12T12:20:00Z',mq135Raw:1,mq136Raw:1}],nextCursor:'cursor',error:'',loading:false};
 vm.runInNewContext(ts.transpileModule(readFileSync('components/history/GasSensorHistory.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>n==='react'?{...React,useState:init=>typeof init==='number'?[init,()=>{}]:[state,()=>{}],useEffect:()=>{},useRef:()=>({current:()=>{}})}:n==='next/link'?{default:props=>React.createElement('a',props)}:n.includes('AuthContext')?{useAuth:()=>({user:{uid}})}:n.includes('notificationLive')?{}:n.includes('gasHistoryGroups')?loadGroups():require(n)});
 return renderToStaticMarkup(React.createElement(exports.GasSensorHistory,{preview}));
}
test('history distinguishes detection, clear and uncertain time and shows recorded separately from uploaded',()=>{
 const html=render();assert.match(html,/Urine odor: Detected/);assert.match(html,/Stool odor: Clear/);assert.match(html,/Recorded:/);assert.match(html,/Uploaded:/);assert.match(html,/Time uncertain/);assert.match(html,/Load older readings/);
 assert.match(render(true),/VIEW ALL/);
});
test('changing accounts immediately hides previously loaded history',()=>{assert.doesNotMatch(render(false,'other'),/Urine odor: Detected/);});

test('repeated readings are combined and only the first 8 rows show, with Show more for the rest',()=>{
 const html=renderWith(Array.from({length:30},(_,i)=>({id:`r${i}`,capturedAt:new Date(Date.UTC(2026,10,9,12,59-i)).toISOString(),receivedAt:new Date(Date.UTC(2026,10,9,12,59-i)).toISOString(),mq135Raw:(Math.floor(i/3)%2===0)?1:0,mq136Raw:1})));
 assert.equal((html.match(/<li /g)||[]).length,8);
 assert.match(html,/3 readings/);
 assert.match(html,/Show more/);
});

test('a combined row that crosses midnight shows the date on both ends of its time range',()=>{
 const newest=new Date(2026,10,9,0,1).toISOString(),oldest=new Date(2026,10,8,23,59).toISOString();
 const html=renderWith([{id:'a',capturedAt:newest,receivedAt:newest,mq135Raw:1,mq136Raw:1},{id:'b',capturedAt:oldest,receivedAt:oldest,mq135Raw:1,mq136Raw:1}]);
 const full=value=>new Date(value).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'});
 assert.ok(html.includes(`Recorded: ${full(oldest)} – ${full(newest)}`),html);
});
