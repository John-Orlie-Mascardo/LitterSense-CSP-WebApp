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
loadModule(testModule.exports, testModule, require);

const {
  buildAggregateTrendReferences,
  buildCatTrendReferences,
  formatTrendTooltipLine,
  formatTrendTick,
  getTrendMetricConfig,
  getTrendYAxisDomain,
  getMetricTrendPoints,
} = testModule.exports;

// A computed baseline (lib/utils/personalBaseline.ts) with its bands filled in.
const computed = (medianVisitsPerDay, visitBand, medianDurationSecs, durationBand) => ({
  established: true,
  daysUsed: 7,
  windowStart: "2026-10-25",
  windowEnd: "2026-11-07",
  medianVisitsPerDay,
  medianDurationSecs,
  visitBand,
  durationBand,
});

test("draws the cat's computed band: median with the MAD lower and upper limits", () => {
  const result = buildCatTrendReferences(computed(4, [2.5, 5.5], 120, [75, 165]));

  assert.deepEqual(result.visits, { baseline: 4, normalMin: 2.5, normalMax: 5.5 });
  assert.deepEqual(result.duration, { baseline: 2, normalMin: 1.25, normalMax: 2.75 });
  assert.equal("airQuality" in result, false);
});

test("a negative lower limit (display only) is drawn from zero", () => {
  const result = buildCatTrendReferences(computed(1, [-0.5, 2], 40, [-5, 70]));
  assert.equal(result.visits.normalMin, 0);
  assert.equal(result.duration.normalMin, 0);
  assert.equal(result.visits.normalMax, 2);
});

test("draws no band until the baseline is established", () => {
  assert.equal(buildCatTrendReferences(null), null);
  assert.equal(buildCatTrendReferences(undefined), null);
  assert.equal(
    buildCatTrendReferences({
      established: false,
      daysUsed: 6,
      windowStart: "2026-10-25",
      windowEnd: "2026-11-07",
      medianVisitsPerDay: null,
      medianDurationSecs: null,
      visitBand: null,
      durationBand: null,
    }),
    null,
  );
});

test("aggregates visits by sum and duration by each cat's median visits per day", () => {
  const result = buildAggregateTrendReferences([
    computed(2, [1, 3], 60, [30, 90]),
    computed(6, [4, 8], 180, [150, 210]),
    null,
  ]);

  assert.deepEqual(result.visits, { baseline: 8, normalMin: 5, normalMax: 11 });
  assert.equal(result.duration.baseline, 2.5);
  assert.equal(result.duration.normalMin, 2);
  assert.equal(result.duration.normalMax, 3);
  assert.equal("airQuality" in result, false);
  assert.equal(buildAggregateTrendReferences([null, undefined]), null);
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

test("duration uses one tick format and only a supplied baseline band", () => {
  assert.equal(formatTrendTick("duration", 0), "0 min");
  assert.equal(formatTrendTick("duration", 1), "1 min");
  assert.equal(formatTrendTick("duration", 2.5), "2.5 min");
  assert.equal("normalRange" in getTrendMetricConfig("visits"), false);
  assert.equal("normalRange" in getTrendMetricConfig("duration"), false);
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
