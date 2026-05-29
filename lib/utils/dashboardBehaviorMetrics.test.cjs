const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/utils/dashboardBehaviorMetrics.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});

const testModule = { exports: {} };
const fn = new Function("exports", "module", compiled.outputText);
fn(testModule.exports, testModule);

const {
  formatAverageDurationFromTrend,
  getDisplayTodayStats,
  getBehaviorTrendLabel,
  getFallbackAverageDuration,
} = testModule.exports;

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
    { visits: 2, avgDuration: "0m 56s" },
  );
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
