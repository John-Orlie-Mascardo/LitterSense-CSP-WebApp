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

test('an account change clears the previous owner health and session logs', () => {
  const source = readFileSync(new URL('./CatContext.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('    const ownerChanged = lastOwnerRef.current !== uid;');
  const end = source.indexOf('    if (!backupReady && !backup.error) return;', start);
  const state = { healthLogs: [{ id: 'owner-a-health' }], catSessionLogs: { shared: { owner: 'owner-a' } } };
  const context = {
    uid: 'owner-b', lastOwnerRef: { current: 'owner-a' }, queueMicrotask: work => work(),
    setPrimaryOwner() {}, setRawCats() {}, setCatDetails() {}, setSessions() {}, setFirebaseCatStats() {}, setCatDailyStats() {}, setCatStats() {}, setIsLoading() {},
    setHealthLogs: value => { state.healthLogs = value; },
    setCatSessionLogs: value => { state.catSessionLogs = value; },
  };
  vm.runInNewContext(ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  assert.equal(state.healthLogs.length, 0);
  assert.equal(Object.keys(state.catSessionLogs).length, 0);
});

test('health and session log getters cannot expose the previous owner before the owner reset runs', () => {
  const source = readFileSync(new URL('./CatContext.tsx', import.meta.url), 'utf8');
  const visibilityStart = source.indexOf('  const visibleHealthLogs =');
  const visibilityEnd = source.indexOf('  const backupStatus =', visibilityStart);
  const healthStart = source.indexOf('  const getHealthLogsByCatId =');
  const healthEnd = source.indexOf('  const getTrendData =', healthStart);
  const sessionsStart = source.indexOf('  const getSessionLogByCatId =');
  const sessionsEnd = source.indexOf('  return (', sessionsStart);
  const context = {
    ownerReady: false, fallbackHistory: false,
    healthLogs: [{ id: 'private-health', catId: 'shared', note: 'Owner A note' }],
    catSessionLogs: { shared: { owner: 'owner-a' } },
    useMemo: work => work(), useCallback: work => work,
  };
  const visibility = visibilityStart < 0 ? '' : source.slice(visibilityStart, visibilityEnd);
  const getters = source.slice(healthStart, healthEnd) + source.slice(sessionsStart, sessionsEnd);
  const provider = source.slice(source.indexOf('<CatContext.Provider'));
  const exportedProperties = [provider.match(/^\s*healthLogs(?:\s*:[^\n,]+)?,/m)?.[0], provider.match(/^\s*catSessionLogs\s*:[^\n]+,/m)?.[0]];
  assert.ok(exportedProperties.every(Boolean), 'provider log values must be included in the regression');
  const executable = ts.transpileModule(visibility + getters + ';globalThis.health=getHealthLogsByCatId;globalThis.session=getSessionLogByCatId;globalThis.provided={' + exportedProperties.join('\n') + '};', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(executable, context);
  assert.equal(context.health('shared').length, 0);
  assert.equal(context.session('shared'), undefined);
  assert.equal(context.provided.healthLogs.length, 0);
  assert.equal(Object.keys(context.provided.catSessionLogs).length, 0);

  const ready = { ...context, ownerReady: true };
  vm.runInNewContext(executable, ready);
  assert.equal(ready.health('shared')[0].note, 'Owner A note', 'current owner data remains available');
  assert.equal(ready.session('shared').owner, 'owner-a');
  assert.equal(ready.provided.healthLogs.length, 1);
  assert.equal(ready.provided.catSessionLogs.shared.owner, 'owner-a');
});
