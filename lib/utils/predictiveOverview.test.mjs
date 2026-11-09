import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const loadedModule = { exports: {} };
const thresholds = { BASELINE_MIN_DAYS: 7, INCOMPLETE_SESSION_FLOOR_SECS: 15 };
const baselineModule = { exports: {} };
const baselineCode = ts.transpileModule(readFileSync(new URL('./personalBaseline.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('exports', 'module', 'require', baselineCode)(baselineModule.exports, baselineModule, () => ({ ...thresholds, ABNORMAL_DURATION_SECS: 300, BASELINE_WINDOW_DAYS: 14, DASHBOARD_VISIT_WARNING_COUNT: 6, MAD_K: 2.5, MAD_SCALE: 1.4826, MIN_DURATION_BAND_S: 30, MIN_VISIT_BAND: 1 }));
const code = ts.transpileModule(readFileSync(new URL('./predictiveOverview.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: id => id === './personalBaseline' ? baselineModule.exports : thresholds, Date, Intl, Map, Set });
const { getPredictiveOverview } = loadedModule.exports;
const now = new Date('2026-10-05T10:00:00Z');
test('zero visits explain setup without fabricating data or baseline readiness', () => {
  const result = getPredictiveOverview([], false, now);
  assert.equal(result.confidence, 'low');
  assert.equal(result.todayCount, 0);
  assert.equal(result.trendData.length, 0);
  assert.match(result.progress, /0 of 7/);
});
test('one and two visits remain visible as chart points and individual records', () => {
  for (const count of [1, 2]) {
    const sessions = Array.from({ length: count }, (_, i) => ({ id: String(i), catId: 'cat-1', endedAt: `2026-10-05T0${i + 2}:00:00Z`, date: '2026-10-05', time: '10:00 AM', durationSecs: 45 + i * 15, sessionStatus: 'NORMAL' }));
    const result = getPredictiveOverview(sessions, false, now);
    assert.equal(result.todayCount, count);
    assert.equal(result.recentVisits.length, count);
    assert.equal(result.trendData[0].visits, count);
    assert.equal(result.confidence, 'low');
    assert.match(result.progress, /1 of 7 days/);
  }
});
test('incomplete visits stay visible but do not establish baseline evidence', () => {
  const result = getPredictiveOverview([{ id: 'short', catId: 'cat-1', endedAt: now.toISOString(), durationSecs: 10, sessionStatus: 'SHORT_SESSION' }], false, now);
  assert.equal(result.todayCount, 0);
  assert.equal(result.todayAvgDurationSecs, null);
  assert.equal(result.completed, 0);
  assert.equal(result.recentVisits.length, 1);
  assert.equal(result.trendData.length, 0);
  assert.match(result.progress, /0 of 7/);
});

test('all Incomplete rules are excluded from Predictive Health counts, averages, and trends', () => {
  const result = getPredictiveOverview([
    { id: 'under-floor', catId: 'cat-1', endedAt: now.toISOString(), durationSecs: 14, sessionStatus: 'NORMAL' },
    { id: 'short', catId: 'cat-1', endedAt: now.toISOString(), durationSecs: 90, sessionStatus: 'SHORT_SESSION' },
    { id: 'timeout', catId: 'cat-1', endedAt: now.toISOString(), durationSecs: 900, sessionStatus: 'NO_EXIT_TIMEOUT' },
    { id: 'interrupted', catId: 'cat-1', endedAt: now.toISOString(), durationSecs: 1, sessionStatus: 'SESSION_INTERRUPTED' },
    { id: 'false-entry', catId: 'cat-1', endedAt: now.toISOString(), durationSecs: 60, sessionStatus: 'FALSE_ENTRY_IGNORED' },
  ], false, now);

  assert.equal(result.todayCount, 0);
  assert.equal(result.todayAvgDurationSecs, null);
  assert.equal(result.completed, 0);
  assert.equal(result.trendData.length, 0);
});



test('reboot duration placeholders never enter charts or baseline progress', () => {
  const result = getPredictiveOverview([{id:'reboot',catId:'cat-1',endedAt:now.toISOString(),durationSecs:1,sessionStatus:'SESSION_INTERRUPTED'}], false, now);
  assert.equal(result.completed, 0); assert.equal(result.todayCount, 0); assert.equal(result.trendData.length, 0);
});
