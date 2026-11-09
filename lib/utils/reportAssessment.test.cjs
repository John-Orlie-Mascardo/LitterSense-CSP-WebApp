const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/utils/reportAssessment.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});

const testModule = { exports: {} };
const fn = new Function("exports", "module", "require", compiled.outputText);
const thresholds = require("../configs/behaviorThresholds.ts");
const behaviorSource = fs.readFileSync("lib/presentation/behaviorStates.ts", "utf8");
const behaviorModule = { exports: {} };
new Function("exports", "module", "require", ts.transpileModule(behaviorSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(behaviorModule.exports, behaviorModule, () => thresholds);
fn(testModule.exports, testModule, (id) => {
  if (id === "@/lib/presentation/behaviorStates") return behaviorModule.exports;
  return require(id);
});

const { getReportConcernCount, isReportSessionConcern } = testModule.exports;
const session = (overrides = {}) => ({
  id: "visit-1",
  catId: "cat-1",
  anomaly: false,
  anomalyType: null,
  durationSecs: 90,
  sessionStatus: "NORMAL",
  ...overrides,
});

test("short sessions do not become report-level health concerns", () => {
  const row = session({
    anomaly: true,
    anomalyType: "Short session",
    durationSecs: 45,
    sessionStatus: "SHORT_SESSION",
  });

  assert.equal(isReportSessionConcern(row), false);
  assert.equal(getReportConcernCount([row]), 0);
});

test("only shared Abnormal results count as report-level health concerns", () => {
  const sessions = [
    session({
      id: "board-abnormal",
      anomaly: true,
      durationSecs: 45,
      sessionStatus: "ABNORMAL",
    }),
    session({
      id: "timeout",
      anomaly: true,
      anomalyType: "No exit timeout",
      durationSecs: 900,
      sessionStatus: "NO_EXIT_TIMEOUT",
    }),
    session({ id: "generic", anomaly: true }),
  ];

  assert.equal(isReportSessionConcern(sessions[0]), true);
  assert.equal(isReportSessionConcern(sessions[1]), false, "timeouts are Incomplete");
  assert.equal(isReportSessionConcern(sessions[2]), false, "the generic anomaly flag is not a state rule");
  assert.equal(getReportConcernCount(sessions), 1);
});

test("duration-only concerns begin at the shared 300-second boundary", () => {
  const row = session({
    durationSecs: 299,
  });

  assert.equal(isReportSessionConcern(row), false);
  assert.equal(isReportSessionConcern({ ...row, durationSecs: 300 }), true);
});
