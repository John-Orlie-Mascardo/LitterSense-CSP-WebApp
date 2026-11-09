const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/utils/dashboardBehaviorMetrics.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});

const testModule = { exports: {} };
const thresholds = require("../configs/behaviorThresholds.ts");
const baselineSource = fs.readFileSync("lib/utils/personalBaseline.ts", "utf8");
const baselineModule = { exports: {} };
new Function("exports", "module", "require", ts.transpileModule(baselineSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(baselineModule.exports, baselineModule, () => thresholds);
const fn = new Function("exports", "module", "require", compiled.outputText);
fn(testModule.exports, testModule, (id) => {
  if (id === "@/lib/utils/personalBaseline") return baselineModule.exports;
  return require(id);
});

const {
  formatAverageDurationFromTrend,
  getDisplayTodayStats,
  getBehaviorTrendLabel,
  getFallbackAverageDuration,
} = testModule.exports;

test("fallback average excludes the unknown duration of an interrupted visit", () => {
  const interrupted = { catId: "cat-1", durationSecs: 1, sessionStatus: "SESSION_INTERRUPTED" };
  assert.equal(getFallbackAverageDuration("--", null, [interrupted], "cat-1"), "--");
  assert.equal(getFallbackAverageDuration("--", null, [interrupted, { catId: "cat-1", durationSecs: 60, sessionStatus: "NORMAL" }], "cat-1"), "1m");
});

test("formats average duration from non-empty trend days", () => {
  assert.equal(
    formatAverageDurationFromTrend([
      { day: "Fri", visits: 0, avgDuration: 0, mq135Delta: 0 },
      { day: "Tue", visits: 2, avgDuration: 48, mq135Delta: 0 },
      { day: "Wed", visits: 1, avgDuration: 37, mq135Delta: 0 },
    ]),
    "0m 44s",
  );
});

test("uses recent sessions when today's stats are empty", () => {
  assert.equal(
    getFallbackAverageDuration("--", null, [
      { catId: "cat-1", durationSecs: 37 },
      { catId: "cat-1", durationSecs: 59 },
      { catId: "cat-2", durationSecs: 120 },
    ], "cat-1"),
    "0m 48s",
  );
});

test("uses today's recent sessions when stored visit stats have not caught up", () => {
  assert.deepEqual(
    getDisplayTodayStats(
      { visits: 0, avgDuration: "0m 56s" },
      [
        {
          catId: "cat-1",
          durationSecs: 39,
          endedAt: "2026-05-28T14:09:00.000Z",
          sessionStatus: "NORMAL",
        },
        {
          catId: "cat-1",
          durationSecs: 49,
          endedAt: "2026-05-28T14:02:00.000Z",
          sessionStatus: "NORMAL",
        },
      ],
      "cat-1",
      "2026-05-28",
    ),
    { visits: 2, avgDuration: "0m 44s" },
  );
});

test("today's count and average exclude every Incomplete visit", () => {
  const rows = [
    { catId: "cat-1", durationSecs: 10, date: "2026-05-28", sessionStatus: "NORMAL" },
    { catId: "cat-1", durationSecs: 90, date: "2026-05-28", sessionStatus: "SHORT_SESSION" },
    { catId: "cat-1", durationSecs: 900, date: "2026-05-28", sessionStatus: "NO_EXIT_TIMEOUT" },
    { catId: "cat-1", durationSecs: 1, date: "2026-05-28", sessionStatus: "SESSION_INTERRUPTED" },
    { catId: "cat-1", durationSecs: 60, date: "2026-05-28", sessionStatus: "FALSE_ENTRY_IGNORED" },
  ];

  assert.deepEqual(
    getDisplayTodayStats({ visits: 5, avgDuration: "3m" }, rows, "cat-1", "2026-05-28"),
    { visits: 0, avgDuration: "--" },
  );
  assert.equal(getFallbackAverageDuration("--", null, rows, "cat-1"), "--");
});

test("behavior trend ignores empty edge days", () => {
  assert.equal(
    getBehaviorTrendLabel([
      { day: "Fri", visits: 0, avgDuration: 0, mq135Delta: 0 },
      { day: "Tue", visits: 5, avgDuration: 56, mq135Delta: 0 },
      { day: "Wed", visits: 1, avgDuration: 37, mq135Delta: 0 },
      { day: "Thu", visits: 0, avgDuration: 0, mq135Delta: 0 },
    ]),
    "Less active",
  );
});
