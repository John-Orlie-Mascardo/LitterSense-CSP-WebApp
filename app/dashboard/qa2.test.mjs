import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../../',import.meta.url);
test('dashboard-only gas history removal preserves the full history surface and receiver',()=>{
 const dashboard=readFileSync(new URL('app/dashboard/page.tsx',root),'utf8');assert.doesNotMatch(dashboard,/<GasSensorHistory/);
 assert.match(readFileSync(new URL('app/dashboard/history/page.tsx',root),'utf8'),/<GasSensorHistory/);
 assert.match(readFileSync(new URL('app/api/sensors/history/route.ts',root),'utf8'),/saveSensorEventHistory/);
});
test('website update loops do not throttle or suspend by tab visibility',()=>{
 for(const file of ['lib/utils/operationalClient.ts','lib/hooks/useCatBackup.ts','lib/hooks/useSessionHistory.ts','components/history/GasSensorHistory.tsx'])assert.doesNotMatch(readFileSync(new URL(file,root),'utf8'),/document\.hidden/,file);
 const camera=readFileSync(new URL('components/dashboard/RemoteCamera.tsx',root),'utf8');
 assert.doesNotMatch(camera,/stopped.*document\.hidden|document\.hidden.*return|Viewer hidden/);
});
