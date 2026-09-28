/**
 * trendCharts.test.cjs
 *
 * Presentation-only tests for trend points, references, ranges, and tooltip copy.
 *
 * DONE: single-cat ranges, aggregate weighting, duration conversion, tooltip layout
 * PLACEHOLDER: none
 *
 * NEXT: update fixtures only when the centrally reviewed presentation ranges change.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/presentation/trendCharts.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});
const testModule = { exports: {} };
const loadModule = new Function("exports", "module", "require", compiled.outputText);
loadModule(testModule.exports, testModule, (id) => {
  if (id === "@/lib/configs/behaviorThresholds") {
    return {
      BASELINE_VISIT_DEVIATION_COUNT: 1,
      BASELINE_DURATION_DEVIATION_SECS: 30,
      BASELINE_AIR_QUALITY_DEVIATION_PERCENT: 7,
      INCOMPLETE_SESSION_FLOOR_SECS: 30,
      DASHBOARD_DURATION_WARNING_MINS: 3,
      DASHBOARD_VISIT_WARNING_COUNT: 6,
    };
  }
  return require(id);
});

const {
  buildAggregateTrendReferences,
  buildCatTrendReferences,
  formatTrendTooltipLine,
  formatTrendTick,
  getTrendMetricConfig,
  getTrendYAxisDomain,
  getMetricTrendPoints,
} = testModule.exports;

test("builds single-cat references from central deviation values", () => {
  const result = buildCatTrendReferences({
    avgVisitsPerDay: 4,
    avgDurationSecs: 120,
    mq135DeltaPercent: 6,
    lastUpdated: "2026-08-31",
  });

  assert.deepEqual(result.visits, { baseline: 4, normalMin: 3, normalMax: 5 });
  assert.deepEqual(result.duration, { baseline: 2, normalMin: 1.5, normalMax: 2.5 });
  assert.deepEqual(result.airQuality, { baseline: 6, normalMin: 0, normalMax: 13 });
});

test("omits references while the baseline is still building", () => {
  assert.equal(
    buildCatTrendReferences({
      avgVisitsPerDay: 0,
      avgDurationSecs: 0,
      mq135DeltaPercent: 0,
      lastUpdated: "2026-08-31",
    }),
    null,
  );
});

test("aggregates visits by sum and other metrics by expected-visit weight", () => {
  const result = buildAggregateTrendReferences([
    { avgVisitsPerDay: 2, avgDurationSecs: 60, mq135DeltaPercent: 4, lastUpdated: "2026-08-31" },
    { avgVisitsPerDay: 6, avgDurationSecs: 180, mq135DeltaPercent: 8, lastUpdated: "2026-08-31" },
  ]);

  assert.equal(result.visits.baseline, 8);
  assert.equal(result.duration.baseline, 2.5);
  assert.equal(result.airQuality.baseline, 7);
  assert.deepEqual(result.visits, { baseline: 8, normalMin: 6, normalMax: 10 });
});

test("converts only duration series values from seconds to minutes", () => {
  const sourcePoints = [{ day: "Mon", visits: 4, avgDuration: 150, mq135Delta: 6 }];
  assert.deepEqual(getMetricTrendPoints(sourcePoints, "duration"), [{ label: "Mon", value: 2.5 }]);
  assert.deepEqual(getMetricTrendPoints(sourcePoints, "visits"), [{ label: "Mon", value: 4 }]);
});

test("formats one readable tooltip line", () => {
  assert.equal(
    formatTrendTooltipLine("Average Duration", 2.25, "minutes", "Mon"),
    "Average Duration: 2.25 minutes — Mon",
  );
});

test("duration uses one tick format and a domain containing its complete normal band", () => {
  assert.equal(formatTrendTick("duration", 0), "0 min");
  assert.equal(formatTrendTick("duration", 1), "1 min");
  assert.equal(formatTrendTick("duration", 2.5), "2.5 min");
  assert.deepEqual(getTrendMetricConfig("duration").normalRange, {
    min: 0.5,
    max: 3,
  });
  assert.deepEqual(
    getTrendYAxisDomain(
      "duration",
      [{ label: "Mon", value: 2 }, { label: "Tue", value: 5 }],
      { baseline: 2.5, normalMin: 2, normalMax: 3 },
    ),
    [0, 6],
  );
});

test("identical metric inputs always produce identical domains", () => {
  const points = [{ label: "Mon", value: 4 }, { label: "Tue", value: 7 }];
  const reference = { baseline: 5, normalMin: 4, normalMax: 6 };
  assert.deepEqual(
    getTrendYAxisDomain("visits", points, reference),
    getTrendYAxisDomain("visits", points, reference),
  );
});
