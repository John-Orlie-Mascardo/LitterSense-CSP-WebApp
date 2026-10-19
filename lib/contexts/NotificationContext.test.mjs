import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {Timestamp} from 'firebase/firestore';

function fixture(primary=true){
 const slots=[],effects=[],cleanups=[],rows=new Map(),writes=[],pushes=[],refreshers=new Set();let index=0,context,legacyReads=0;
 let user={uid:'owner',getIdToken:async()=> 'test'},page={rows:[],unreadCount:80,totalCount:100,nextCursor:{time:'0',path:'users/owner/notifications/x'}};
 const react={createContext:()=>({Provider:'provider'}),createElement:(_type,props)=>{context=props.value;return context;},useContext:()=>context,
  useState:initial=>{const i=index++;if(!(i in slots))slots[i]=initial;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},
  useRef:initial=>{const i=index++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useMemo:fn=>fn(),useCallback:fn=>fn,
  useEffect:(fn,deps)=>{const i=index++;if(!slots[i]||deps?.some((v,j)=>v!==slots[i][j])){slots[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});}}
 };
 react.default=react;
 const client={Timestamp,collection:(_db,...p)=>({path:p.join('/')}),doc:(_db,...p)=>({path:p.join('/'),id:p.at(-1)}),query:ref=>ref,orderBy:()=>({}),serverTimestamp:()=>Timestamp.fromDate(new Date()),
  onSnapshot:(_ref,changed)=>{legacyReads++;changed({forEach:fn=>page.rows.forEach(r=>fn({id:r.path.split('/').at(-1),data:()=>r.data}))});return()=>{};},
  getNotificationPage:async()=>page,subscribeNotificationRefresh:(_uid,fn)=>{refreshers.add(fn);return()=>refreshers.delete(fn);},refreshNotificationRecords:()=>refreshers.forEach(fn=>fn()),
  mutateNotificationHistory:async operation=>{writes.push(operation);},setDoc:async(ref,data)=>{writes.push('set');rows.set(ref.path,data);},updateDoc:async(ref,data)=>{writes.push('update');rows.set(ref.path,{...rows.get(ref.path),...data});},
  runTransaction:async(_db,work)=>work({get:async ref=>({exists:()=>rows.has(ref.path),data:()=>rows.get(ref.path)}),set:(ref,data)=>{writes.push('set');rows.set(ref.path,data);},update:(ref,data)=>{writes.push('update');rows.set(ref.path,{...rows.get(ref.path),...data});}})
 };
 const modules=new Map();function load(file){if(modules.has(file))return modules.get(file);const exports={};modules.set(file,exports);vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,{exports,require:name=>name==='react'?react:name.endsWith('/operationalClient')?client:name.endsWith('/firebase')?{db:{},auth:{get currentUser(){return user;}}}:name.endsWith('/AuthContext')?{useAuth:()=>({user,loading:false})}:name.endsWith('/useSettings')?{useSettings:()=>({settings:{notifications:{healthAlerts:true}}})}:name.endsWith('/operationalMode')?{operationalPrimary:async()=>primary}:name.endsWith('/notificationLive')?{subscribeNotificationLive:()=>()=>{}}:load(name.replace('@/','')+'.ts'),console,queueMicrotask,navigator:{},document:{hidden:false},Date,Set,Map,fetch:async()=>{pushes.push(1);return {ok:true};},setTimeout:()=>1,clearTimeout(){}});return exports;}
 const api=load('lib/contexts/NotificationContext.tsx');
 const render=()=>{index=0;api.NotificationProvider({children:null});effects.splice(0).forEach(fn=>fn());return context;};
 const flush=async()=>{for(let i=0;i<4;i++){await new Promise(r=>setImmediate(r));render();}return context;};
 return {render,flush,rows,writes,pushes,setPage:value=>{page=value;},get legacyReads(){return legacyReads;},switchUser:()=>{user={uid:'other',getIdToken:async()=> 'other'};}};
}

test('primary notification provider uses bounded pages and the global unread count',async()=>{
 const f=fixture();f.setPage({rows:Array.from({length:25},(_,i)=>({path:`users/owner/notifications/n${i}`,data:{createdAt:'2026-10-15T00:00:00Z',isRead:i>=5}})),unreadCount:80,totalCount:100,nextCursor:{time:'0',path:'users/owner/notifications/n24'}});f.render();const state=await f.flush();assert.equal(state.unreadCount,80);assert.equal(state.notifications.length,25);assert.equal(f.legacyReads,0);
 await state.markAllAsRead();assert.equal(f.writes.at(-1),'markRead');await state.clearAll();assert.equal(f.writes.at(-1),'clear');
});

test('upserting an old notification outside the loaded page preserves its read state and date without another push',async()=>{
 const f=fixture(),id=encodeURIComponent('health:old'),date=Timestamp.fromDate(new Date('2026-01-01T00:00:00Z')),path=`users/owner/notifications/${id}`;
 f.rows.set(path,{type:'health',title:'Existing',message:'Same',abnormalKey:'health:old',createdAt:date,isRead:true});f.render();const state=await f.flush();
 await state.upsertNotification({type:'health',title:'Existing',message:'Same',abnormalKey:'health:old'});
 assert.equal(f.rows.get(path).isRead,true);assert.equal(f.rows.get(path).createdAt,date);assert.equal(f.pushes.length,0);assert.equal(f.writes.length,0);
});

test('legacy notifications use the same dated gas presentation without writing or sending another push',async()=>{
 const f=fixture(false),stamp=new Timestamp(1792395328,123456789);
 f.setPage({rows:[{path:'users/owner/notifications/gas%3Aold',data:{type:'health',source:'ammonia_alert',title:'Urine detected',message:'Gas detected near the litter box. Check the litter box and ventilation.',createdAt:stamp,isRead:true}}]});
 f.render();const state=await f.flush();
 assert.equal(state.notifications[0].message,'Odor detected at Oct 19, 2026, 3:35 PM. Check the litter box and ventilation.');
 assert.equal(state.notifications[0].title,'Urine detected');assert.equal(state.notifications[0].id,'gas%3Aold');assert.equal(state.notifications[0].createdAt.nanoseconds,123456789);assert.equal(state.notifications[0].isRead,true);
 assert.equal(f.writes.length,0);assert.equal(f.pushes.length,0);
});
