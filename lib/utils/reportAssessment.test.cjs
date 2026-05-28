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
fn(testModule.exports, testModule, require);

const { getReportConcernCount, isReportSessionConcern } = testModule.exports;

test("short sessions do not become report-level health concerns", () => {
  const session = {
    anomaly: true,
    anomalyType: "Short session",
    durationSecs: 45,
    sessionStatus: "SHORT_SESSION",
  };

  assert.equal(isReportSessionConcern(session), false);
  assert.equal(getReportConcernCount([session]), 0);
});

test("true abnormal sessions still count as report-level health concerns", () => {
  const sessions = [
    {
      anomaly: true,
      anomalyType: null,
      durationSecs: 45,
      sessionStatus: "ABNORMAL",
    },
    {
      anomaly: true,
      anomalyType: "No exit timeout",
      durationSecs: 900,
      sessionStatus: "NO_EXIT_TIMEOUT",
      summaryVisits: 2,
    },
  ];

  assert.equal(sessions.every(isReportSessionConcern), true);
  assert.equal(getReportConcernCount(sessions), 3);
});
