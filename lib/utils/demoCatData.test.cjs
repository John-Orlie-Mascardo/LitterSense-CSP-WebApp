/** Shared display fallback contract for cats without recorded evidence. */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/utils/demoCatData.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});
const testModule = { exports: {} };
new Function("exports", "module", compiled.outputText)(testModule.exports, testModule);

const { buildDemoCatData, shouldUseDemoCatData } = testModule.exports;

test("builds stable normal, watch, and abnormal fallback profiles", () => {
  const normal = buildDemoCatData("zeno", 0, new Date(2026, 7, 25, 12));
  const watch = buildDemoCatData("pusa", 1, new Date(2026, 7, 25, 12));
  const abnormal = buildDemoCatData("teddy", 2, new Date(2026, 7, 25, 12));

  assert.deepEqual(
    [normal.state, watch.state, abnormal.state],
    ["normal", "watch", "abnormal"],
  );
  assert.equal(normal.details.baseline.avgVisitsPerDay, 4);
  assert.equal(normal.sessions.filter((session) => session.date === "2026-08-25").length, 4);
  assert.equal(watch.sessions.filter((session) => session.date === "2026-08-25").length, 6);
  assert.equal(abnormal.sessions.filter((session) => session.date === "2026-08-25").length, 9);
  assert.equal(abnormal.sessions.filter((session) => session.anomaly).length, 2);
  assert.deepEqual(buildDemoCatData("zeno", 0, new Date(2026, 7, 25, 12)), normal);
});

test("uses fallback only while a cat has no real evidence", () => {
  assert.equal(shouldUseDemoCatData({ catId: "zeno", sessions: [] }), true);
  assert.equal(
    shouldUseDemoCatData({
      catId: "zeno",
      sessions: [{ catId: "zeno" }],
    }),
    false,
  );
  assert.equal(
    shouldUseDemoCatData({
      catId: "zeno",
      sessions: [],
      baseline: { avgVisitsPerDay: 4, avgDurationSecs: 120, lastUpdated: "2026-08-20" },
    }),
    false,
  );
  assert.equal(
    shouldUseDemoCatData({ catId: "zeno", sessions: [], hasStoredStats: true }),
    false,
  );
});
