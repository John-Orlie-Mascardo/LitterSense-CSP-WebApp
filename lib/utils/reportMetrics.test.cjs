const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const compile = (path, resolve) => {
  const loaded = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function("exports", "module", "require", output)(loaded.exports, loaded, resolve);
  return loaded.exports;
};

const thresholds = require("../configs/behaviorThresholds.ts");
const personalBaseline = compile("lib/utils/personalBaseline.ts", () => thresholds);
const { getCountedReportMetrics } = compile("lib/utils/reportMetrics.ts", (id) => {
  if (id === "@/lib/utils/personalBaseline") return personalBaseline;
  return require(id);
});

const visit = (id, overrides = {}) => ({
  id,
  catId: "cat-1",
  durationSecs: 60,
  sessionStatus: "NORMAL",
  ...overrides,
});

test("report totals, Avg/Day, and average duration exclude Incomplete visits", () => {
  const result = getCountedReportMetrics([
    visit("valid-1", { durationSecs: 60 }),
    visit("valid-2", { durationSecs: 90 }),
    visit("under-floor", { durationSecs: 14 }),
    visit("short", { durationSecs: 90, sessionStatus: "SHORT_SESSION" }),
    visit("timeout", { durationSecs: 900, sessionStatus: "NO_EXIT_TIMEOUT" }),
    visit("interrupted", { durationSecs: 1, sessionStatus: "SESSION_INTERRUPTED" }),
    visit("false-entry", { durationSecs: 60, sessionStatus: "FALSE_ENTRY_IGNORED" }),
    visit("summary", { durationSecs: 45, sessionStatus: "DAILY_SUMMARY", summaryVisits: 8 }),
  ], 2);

  assert.deepEqual(result.countedSessions.map((row) => row.id), ["valid-1", "valid-2"]);
  assert.equal(result.totalSessions, 2);
  assert.equal(result.avgSessionsPerDay, 1);
  assert.equal(result.avgDurationSecs, 75);
});
