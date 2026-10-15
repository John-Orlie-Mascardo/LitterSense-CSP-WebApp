import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function fixture(){
 const state=[],filters=[],routes=[];let index=0,older=0,retries=0,failRead=false;
 const feed={notifications:[],isLoading:false,hasMore:true,isLoadingMore:false,error:'',loadMore:()=>{older++;},retry:()=>{retries++;}};
 const jsx=(type,props)=>({type,props}),exports={};
 vm.runInNewContext(ts.transpileModule(readFileSync('app/dashboard/notifications/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
  if(name==='react')return{useMemo:fn=>fn(),useState:initial=>{const i=index++;state[i]??=initial;return[state[i],value=>{state[i]=value;}];}};
  if(name==='next/navigation')return{useRouter:()=>({push:route=>routes.push(route),back(){}})};
  if(name==='framer-motion')return{motion:new Proxy({},{get:(_t,key)=>key}),AnimatePresence:'animation'};
  if(name.endsWith('/useNotificationHistory'))return{useNotificationHistory:category=>{filters.push(category);return feed;}};
  if(name.endsWith('/NotificationContext'))return{useNotifications:()=>({notifications:[],isLoading:false,paginated:true,markAsRead:async()=>{if(failRead)throw new Error('Write failed');},markAllAsRead:async()=>{},clearAll:async()=>{},deleteNotification:async()=>{}}),getDateGroup:()=> 'today',getNotificationCategory:()=> 'alerts'};
  return{};
 }});
 const nodes=()=>{index=0;const found=[];const walk=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}found.push(node);walk(node.props?.children);};walk(exports.default());return found;};
 return{nodes,feed,filters,routes,get older(){return older;},get retries(){return retries;},failRead:()=>{failRead=true;}};
}
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):'';

test('notification page loads older history on demand and sends category changes to the server feed',()=>{
 const f=fixture();let nodes=f.nodes();nodes.find(node=>node.type==='button'&&text(node)==='Load older notifications').props.onClick();assert.equal(f.older,1);
 nodes.find(node=>node.type==='button'&&text(node)==='System').props.onClick();f.nodes();assert.equal(f.filters.at(-1),'system');
 f.feed.error='Unavailable';f.feed.hasMore=false;nodes=f.nodes();assert.ok(nodes.some(node=>node.props?.role==='alert'));nodes.find(node=>node.type==='button'&&text(node)==='Try again').props.onClick();assert.equal(f.retries,1);
});

test('notification click reports a failed read update instead of navigating with an unconfirmed change',async()=>{
 const f=fixture();f.feed.notifications=[{id:'older',title:'Older',createdAt:{},route:'/dashboard/reports'}];f.failRead();
 const row=f.nodes().find(node=>node.type?.name==='NotificationRow');row.props.onOpen();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.routes.length,0);assert.ok(f.nodes().some(node=>node.props?.role==='alert'&&text(node).includes("Couldn't mark")));
});
