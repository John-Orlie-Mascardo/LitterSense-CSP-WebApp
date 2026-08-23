/**
 * behaviorStates.test.cjs
 *
 * Behavioral tests for presentation-only state and no-data derivation.
 *
 * DONE: baseline gating, upstream status mapping, severity, metric absence
 * PLACEHOLDER: none
 *
 * NEXT: frontend developers should extend fixtures when firmware adds a new
 * persisted session status; detection rules remain outside this module.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/presentation/behaviorStates.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});

const testModule = { exports: {} };
const loadModule = new Function("exports", "module", compiled.outputText);
loadModule(testModule.exports, testModule);

const {
  BEHAVIOR_STATES,
  formatMetricValue,
  getCatDisplayState,
  getMostSevereState,
  getSessionDisplayState,
  hasEstablishedBaseline,
  hasRecordedCatData,
} = testModule.exports;

const establishedDetails = {
  baseline: {
    avgVisitsPerDay: 3,
    avgDurationSecs: 95,
    mq135DeltaPercent: 0,
    mq136DeltaPercent: 0,
    lastUpdated: "2026-08-20",
  },
};

test("a cat without recorded evidence displays insufficient data", () => {
  assert.equal(
    hasRecordedCatData({ sessions: [], stats: { visits: 0, lastVisit: "" }, trendData: null }),
    false,
  );
  assert.equal(
    getCatDisplayState({ persistedStatus: "normal", hasData: false, baselineEstablished: false }),
    "insufficient",
  );
});

test("ordinary sessions cannot display normal before a baseline exists", () => {
  assert.equal(hasEstablishedBaseline({ baseline: { ...establishedDetails.baseline, avgDurationSecs: 0 } }), false);
  assert.equal(
    getCatDisplayState({ persistedStatus: "normal", hasData: true, baselineEstablished: false }),
    "insufficient",
  );
  assert.equal(
    getSessionDisplayState({ sessionStatus: "NORMAL", anomaly: false, isAttributed: true, baselineEstablished: false }),
    "insufficient",
  );
});

test("an established baseline and existing normal classification display normal", () => {
  assert.equal(hasEstablishedBaseline(establishedDetails), true);
  assert.equal(
    getCatDisplayState({ persistedStatus: "normal", hasData: true, baselineEstablished: true }),
    "normal",
  );
  assert.equal(
    getSessionDisplayState({ sessionStatus: "NORMAL", anomaly: false, isAttributed: true, baselineEstablished: true }),
    "normal",
  );
});

test("existing abnormal and watch classifications remain visible", () => {
  assert.equal(
    getCatDisplayState({ persistedStatus: "abnormal", hasData: true, baselineEstablished: true }),
    "abnormal",
  );
  assert.equal(
    getSessionDisplayState({ sessionStatus: "WATCH", anomaly: false, isAttributed: true, baselineEstablished: true }),
    "watch",
  );
  assert.equal(
    getSessionDisplayState({ sessionStatus: "NO_EXIT_TIMEOUT", anomaly: true, isAttributed: true, baselineEstablished: false }),
    "abnormal",
  );
});

test("incomplete and unattributed sessions keep their explicit display states", () => {
  assert.equal(
    getSessionDisplayState({ sessionStatus: "SHORT_SESSION", anomaly: true, isAttributed: true, baselineEstablished: false }),
    "incomplete",
  );
  assert.equal(
    getSessionDisplayState({ sessionStatus: "NORMAL", anomaly: false, isAttributed: false, baselineEstablished: true }),
    "unattributed",
  );
});

test("group severity selects the strongest existing state and defaults safely", () => {
  assert.equal(getMostSevereState(["normal", "incomplete", "watch"]), "watch");
  assert.equal(getMostSevereState(["watch", "abnormal", "normal"]), "abnormal");
  assert.equal(getMostSevereState([]), "insufficient");
});

test("missing metrics say no data yet while a real zero remains zero", () => {
  assert.equal(formatMetricValue(0, false), "No data yet");
  assert.equal(formatMetricValue("--", true), "No data yet");
  assert.equal(formatMetricValue(0, true), 0);
  assert.equal(formatMetricValue("0m", true), "0m");
});

test("the shared reference contains each state exactly once", () => {
  assert.deepEqual(
    BEHAVIOR_STATES.map((state) => state.label),
    ["Normal", "Watch", "Abnormal", "Insufficient data", "Incomplete", "Unattributed"],
  );
  assert.equal(new Set(BEHAVIOR_STATES.map((state) => state.id)).size, 6);
});
