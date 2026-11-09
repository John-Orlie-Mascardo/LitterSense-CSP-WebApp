import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);
const compileModule = (path, resolve) => {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const loaded = { exports: {} };
  new Function('exports', 'module', 'require', output)(loaded.exports, loaded, resolve);
  return loaded.exports;
};
const thresholds = compileModule('../configs/behaviorThresholds.ts', nodeRequire);
const personalBaseline = compileModule('../utils/personalBaseline.ts', id => id === '@/lib/configs/behaviorThresholds' ? thresholds : nodeRequire(id));
const behaviorStates = compileModule('../presentation/behaviorStates.ts', () => thresholds);
const catBehavior = compileModule('../presentation/catBehavior.ts', id => id === '@/lib/utils/personalBaseline' ? personalBaseline : id === '@/lib/presentation/behaviorStates' ? behaviorStates : nodeRequire(id));

test('live status uses the shared rollup: short, timed-out, and restart visits do not mark a cat abnormal', () => {
  const source = readFileSync(new URL('./CatContext.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('const deriveLiveStatus');
  const end = source.indexOf('const buildTrendData', start);
  const context = { getCatBehaviorToday: catBehavior.getCatBehaviorToday };
  vm.runInNewContext(ts.transpileModule(source.slice(start, end) + ';globalThis.status=deriveLiveStatus;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const status = sessions => context.status({ id: 'cat', status: 'normal' }, sessions, catBehavior.buildCatBehaviorIndex(sessions));
  const now = new Date().toISOString();
  let id = 0;
  const row = (overrides) => ({ id: `v${++id}`, catId: 'cat', date: now.slice(0, 10), endedAt: now, sessionStatus: 'NORMAL', durationSecs: 90, anomaly: false, anomalyType: null, ...overrides });
  assert.equal(status([row({ sessionStatus: 'SESSION_INTERRUPTED', durationSecs: 1, anomaly: true, anomalyType: 'Session interrupted' })]), 'normal');
  assert.equal(status([row({ sessionStatus: 'NO_EXIT_TIMEOUT', anomaly: true, anomalyType: 'No exit timeout', durationSecs: 900 })]), 'normal', 'a timeout is Incomplete, not Abnormal');
  assert.equal(status([row({ durationSecs: 40, anomaly: true, anomalyType: 'Short session' })]), 'normal', 'the generic anomaly flag no longer decides on its own');
  assert.equal(status([row({ durationSecs: 300 })]), 'abnormal');
  assert.equal(status([row({ sessionStatus: 'ABNORMAL' })]), 'abnormal');
  assert.equal(status([...Array.from({ length: 6 }, () => row({})), row({ durationSecs: 10 })]), 'normal', 'short visits do not reach the 7th-visit rule');
  assert.equal(status(Array.from({ length: 7 }, () => row({}))), 'abnormal');
  assert.equal(status([row({ catId: 'other', durationSecs: 900 })]), 'normal', 'another cat\'s visit is ignored');
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
    setPrimaryOwner() {}, setPrimaryCatalogOwner() {}, setRawCats() {}, setCatDetails() {}, setSessions() {}, setFirebaseCatStats() {}, setCatDailyStats() {}, setCatStats() {}, setIsLoading() {},
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
