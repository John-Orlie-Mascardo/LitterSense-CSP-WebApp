import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import ts from 'typescript';
function load(path) {
  const loadedModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {module:loadedModule,exports:loadedModule.exports,Date,require:()=>({})});
  return loadedModule.exports;
}
const gas=load('lib/utils/gasUltrasonic.ts'), rfid=load('lib/utils/deviceSensorSnapshot.ts');
const receipt=Date.parse('2026-10-08T08:00:00Z');
const snapshot={updatedAt:new Date(receipt).toISOString(),online:true,mq135Raw:1,mq136Raw:1,distanceCm:null};
for(const age of [0,5000,30000,60000,90000,90001,94000,120000,120001]) {
 const g=gas.toGasUltrasonicResponse(snapshot,receipt+age).gasUltrasonicOnline;
 const r=rfid.toDeviceSensorsResponse(snapshot,{now:new Date(receipt+age)}).online;
 assert.equal(g,age<=120000); assert.equal(r,age<=90000);
 console.log(JSON.stringify({heartbeatAgeSeconds:age/1000,gasOnline:g,rfidOnline:r}));
}
let offlineAt;
for(let elapsed=0;elapsed<=130000;elapsed+=2000) if(!gas.toGasUltrasonicResponse(snapshot,receipt+elapsed).gasUltrasonicOnline){offlineAt=elapsed;break;}
assert.equal(offlineAt,122000);
const restored={...snapshot,updatedAt:new Date(receipt+200000).toISOString()};
assert.equal(gas.toGasUltrasonicResponse(restored,receipt+200000).gasUltrasonicOnline,true);
console.log(JSON.stringify({scenario:'power off immediately after last receipt; 2s polling; zero network delay',offlineDisplayedSeconds:offlineAt/1000}));
console.log(JSON.stringify({scenario:'new heartbeat accepted after boot',serverOnlineImmediately:true,visibleIdlePollWaitSeconds:'0–2 plus request time',bootWifiNtpDelay:'not simulated; requires device evidence'}));
