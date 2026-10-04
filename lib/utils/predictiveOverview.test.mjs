import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const loadedModule = { exports: {} };
const code = ts.transpileModule(readFileSync(new URL('./predictiveOverview.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: () => ({ BASELINE_PERIOD_DAYS: 7 }), Date, Intl, Map, Set });
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
    const sessions = Array.from({ length: count }, (_, i) => ({ id: String(i), endedAt: `2026-10-05T0${i + 2}:00:00Z`, date: '2026-10-05', time: '10:00 AM', durationSecs: 45 + i * 15, sessionStatus: 'NORMAL' }));
    const result = getPredictiveOverview(sessions, false, now);
    assert.equal(result.todayCount, count);
    assert.equal(result.recentVisits.length, count);
    assert.equal(result.trendData[0].visits, count);
    assert.equal(result.confidence, 'low');
    assert.match(result.progress, /1 of 7 days/);
  }
});
test('incomplete visits stay visible but do not establish baseline evidence', () => {
  const result = getPredictiveOverview([{ id: 'short', endedAt: now.toISOString(), durationSecs: 10, sessionStatus: 'SHORT_SESSION' }], false, now);
  assert.equal(result.todayCount, 1);
  assert.equal(result.completed, 0);
  assert.equal(result.recentVisits.length, 1);
  assert.match(result.progress, /0 of 7/);
});

