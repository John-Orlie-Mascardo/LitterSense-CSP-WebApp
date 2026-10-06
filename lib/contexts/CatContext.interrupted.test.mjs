import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
test('a device restart alone does not mark a cat abnormal', () => {
  const source = readFileSync(new URL('./CatContext.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('const deriveLiveStatus');
  const end = source.indexOf('const buildTrendData', start);
  const context = { getSessionActivityDateKey: row => row.date };
  vm.runInNewContext(ts.transpileModule(source.slice(start, end) + ';globalThis.status=deriveLiveStatus;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const cat = { id: 'cat', status: 'normal' };
  const restart = { catId: 'cat', date: '2026-10-06', sessionStatus: 'SESSION_INTERRUPTED', durationSecs: 1, anomaly: true, anomalyType: 'Session interrupted' };
  assert.equal(context.status(cat, { visits: 0 }, [restart], '2026-10-06'), 'normal');
  assert.equal(context.status(cat, { visits: 0 }, [{ ...restart, sessionStatus: 'NO_EXIT_TIMEOUT', anomalyType: 'No exit timeout', durationSecs: 900 }], '2026-10-06'), 'abnormal');
});
test('interrupted visits remain visible in history without hiding summary-backed normal visits', () => {
  const source=readFileSync(new URL('./CatContext.tsx',import.meta.url),'utf8');
  const start=source.indexOf('const buildSessionsWithDailySummaries');
  const end=source.indexOf('const deriveStatsForCat',start);
  const context={getSessionSortValue:()=>0};
  vm.runInNewContext(ts.transpileModule(source.slice(start,end)+';globalThis.build=buildSessionsWithDailySummaries;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  const rows=context.build('cat',[{id:'reboot',catId:'cat',date:'2026-10-06',sessionStatus:'SESSION_INTERRUPTED',durationSecs:1},{id:'normal',catId:'cat',date:'2026-10-06',sessionStatus:'NORMAL',durationSecs:45}],[{date:'2026-10-06',visits:1,totalDurationSecs:45}]);
  assert.equal(rows.length,2); assert.ok(rows.some(row=>row.id==='reboot'));
});
