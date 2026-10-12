import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require=createRequire(import.meta.url);
function render(preview=false,uid='owner'){
 const exports={};const state={uid:'owner',events:[{id:'saved',capturedAt:'2026-10-12T12:17:55Z',receivedAt:'2026-10-12T12:19:34Z',mq135Raw:0,mq136Raw:1},{id:'unknown',capturedAt:null,receivedAt:'2026-10-12T12:20:00Z',mq135Raw:1,mq136Raw:1}],nextCursor:'cursor',error:'',loading:false};
 vm.runInNewContext(ts.transpileModule(readFileSync('components/history/GasSensorHistory.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>n==='react'?{...React,useState:()=>[state,()=>{}],useEffect:()=>{},useRef:()=>({current:()=>{}})}:n==='next/link'?{default:props=>React.createElement('a',props)}:n.includes('AuthContext')?{useAuth:()=>({user:{uid}})}:n.includes('notificationLive')?{}:require(n)});
 return renderToStaticMarkup(React.createElement(exports.GasSensorHistory,{preview}));
}
test('history distinguishes detection, clear and uncertain time and shows recorded separately from uploaded',()=>{
 const html=render();assert.match(html,/Urine odor: Detected/);assert.match(html,/Stool odor: Clear/);assert.match(html,/Recorded:/);assert.match(html,/Uploaded:/);assert.match(html,/Time uncertain/);assert.match(html,/Load older readings/);
 assert.match(render(true),/VIEW ALL/);
});
test('changing accounts immediately hides previously loaded history',()=>{assert.doesNotMatch(render(false,'other'),/Urine odor: Detected/);});
