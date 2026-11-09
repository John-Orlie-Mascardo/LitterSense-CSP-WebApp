/**
 * behaviorStates.test.cjs
 *
 * Behavioral tests for presentation-only state and no-data derivation.
 *
 * DONE: computed-baseline gating, Watch, Normal (provisional), fixed Abnormal
 * limits, upstream status mapping, severity, metric absence
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
const loadModule = new Function("exports", "module", "require", compiled.outputText);
loadModule(testModule.exports, testModule, () => require("../configs/behaviorThresholds.ts"));

const {
  BEHAVIOR_STATES,
  formatMetricValue,
  getBehaviorStateLabel,
  getMostSevereState,
  getSessionBehavior,
  getSessionDisplayState,
  hasEstablishedBaseline,
  hasRecordedCatData,
  summarizeCatBehavior,
} = testModule.exports;

// A computed baseline: median 2 visits/day and 90 s; upper limits 3 visits and 120 s.
const ESTABLISHED = {
  established: true,
  daysUsed: 7,
  windowStart: "2026-10-25",
  windowEnd: "2026-11-07",
  medianVisitsPerDay: 2,
  medianDurationSecs: 90,
  visitBand: [1, 3],
  durationBand: [60, 120],
};
const NOT_ESTABLISHED = {
  established: false,
  daysUsed: 6,
  windowStart: "2026-10-25",
  windowEnd: "2026-11-07",
  medianVisitsPerDay: null,
  medianDurationSecs: null,
  visitBand: null,
  durationBand: null,
};

test("completed duration precedes anomaly and baseline, preserving the 15-second boundary", () => {
  const base = { isAttributed: true, sessionStatus: "NORMAL" };
  for (const durationSecs of [0, 5, 7, 9, 13, 14, 14.99]) {
    assert.equal(getSessionDisplayState({ ...base, durationSecs }), "incomplete");
    assert.equal(getSessionDisplayState({ ...base, durationSecs, anomaly: true }), "incomplete");
    assert.equal(getSessionDisplayState({ ...base, durationSecs, isAttributed: false }), "unattributed");
  }
  assert.deepEqual(getSessionBehavior({ ...base, durationSecs: 15 }), { state: "normal", provisional: true });
  assert.deepEqual(getSessionBehavior({ ...base, durationSecs: 15, baseline: ESTABLISHED }), { state: "normal", provisional: false });
  assert.equal(getSessionDisplayState({ ...base, sessionStatus: "WATCH" }), "insufficient");
  for (const durationSecs of [undefined, null, NaN, Infinity, -1]) {
    assert.equal(getSessionDisplayState({ ...base, durationSecs }), "insufficient");
  }
  for (const sessionStatus of ["DAILY_SUMMARY", "IN_PROGRESS"]) {
    assert.equal(getSessionDisplayState({ ...base, sessionStatus, durationSecs: 5 }), "insufficient");
  }
});

test("the generic anomaly flag never decides a state on its own", () => {
  const visit = { isAttributed: true, sessionStatus: "NORMAL", durationSecs: 90, anomaly: true };
  assert.deepEqual(getSessionBehavior(visit), { state: "normal", provisional: true });
  assert.deepEqual(getSessionBehavior({ ...visit, baseline: ESTABLISHED }), { state: "normal", provisional: false });
});

test("a cat without recorded evidence displays insufficient data", () => {
  assert.equal(
    hasRecordedCatData({ sessions: [], stats: { visits: 0, lastVisit: "" }, trendData: null }),
    false,
  );
  assert.deepEqual(
    summarizeCatBehavior({ sessionStates: [], hasCountedVisits: false, baseline: null }),
    { state: "insufficient", provisional: false },
  );
});

test("before a baseline exists, a counted visit shows Normal (provisional), never Insufficient data", () => {
  assert.equal(hasEstablishedBaseline(NOT_ESTABLISHED), false);
  assert.equal(hasEstablishedBaseline(null), false);
  assert.deepEqual(
    getSessionBehavior({ sessionStatus: "NORMAL", durationSecs: 90, isAttributed: true, baseline: NOT_ESTABLISHED }),
    { state: "normal", provisional: true },
  );
  assert.deepEqual(
    summarizeCatBehavior({ sessionStates: [], hasCountedVisits: true, baseline: NOT_ESTABLISHED }),
    { state: "normal", provisional: true },
  );
});

test("an established baseline displays Normal without the provisional flag", () => {
  assert.equal(hasEstablishedBaseline(ESTABLISHED), true);
  assert.deepEqual(
    getSessionBehavior({ sessionStatus: "NORMAL", durationSecs: 90, isAttributed: true, baseline: ESTABLISHED }),
    { state: "normal", provisional: false },
  );
  assert.deepEqual(
    summarizeCatBehavior({ sessionStates: [], hasCountedVisits: true, baseline: ESTABLISHED }),
    { state: "normal", provisional: false },
  );
});

test("Abnormal fires at 300 s, on the 7th counted visit, or on board status ABNORMAL, with or without a baseline", () => {
  for (const baseline of [null, NOT_ESTABLISHED, ESTABLISHED]) {
    const visit = { sessionStatus: "NORMAL", durationSecs: 90, isAttributed: true, baseline };
    assert.notEqual(getSessionDisplayState({ ...visit, durationSecs: 299 }), "abnormal");
    assert.equal(getSessionDisplayState({ ...visit, durationSecs: 300 }), "abnormal");
    assert.notEqual(getSessionDisplayState({ ...visit, countedVisitsToday: 6 }), "abnormal");
    assert.equal(getSessionDisplayState({ ...visit, countedVisitsToday: 7 }), "abnormal");
    assert.equal(getSessionDisplayState({ ...visit, sessionStatus: "ABNORMAL" }), "abnormal");
  }
});

test("Watch fires only above the cat's own upper limits, and only with an established baseline", () => {
  const visit = { sessionStatus: "NORMAL", durationSecs: 90, isAttributed: true, baseline: ESTABLISHED };
  assert.equal(getSessionDisplayState({ ...visit, durationSecs: 120 }), "normal");
  assert.equal(getSessionDisplayState({ ...visit, durationSecs: 121 }), "watch");
  assert.equal(getSessionDisplayState({ ...visit, countedVisitsToday: 3 }), "normal");
  assert.equal(getSessionDisplayState({ ...visit, countedVisitsToday: 4 }), "watch");
  // Abnormal outranks Watch.
  assert.equal(getSessionDisplayState({ ...visit, durationSecs: 300 }), "abnormal");
  // Never provisional: no baseline, no Watch.
  assert.deepEqual(
    getSessionBehavior({ ...visit, durationSecs: 121, countedVisitsToday: 4, baseline: NOT_ESTABLISHED }),
    { state: "normal", provisional: true },
  );
  // A saved report knows the baseline existed but not its bands: no Watch.
  assert.equal(
    getSessionDisplayState({ ...visit, durationSecs: 200, baseline: { established: true, visitBand: null, durationBand: null } }),
    "normal",
  );
});

test("existing abnormal and watch classifications remain visible", () => {
  assert.equal(
    getSessionDisplayState({ sessionStatus: "WATCH", durationSecs: 90, isAttributed: true, baseline: ESTABLISHED }),
    "watch",
  );
  assert.equal(
    getSessionDisplayState({ sessionStatus: "NO_EXIT_TIMEOUT", anomaly: true, isAttributed: true }),
    "incomplete",
  );
});

test("incomplete and unattributed sessions keep their explicit display states", () => {
  assert.equal(
    getSessionDisplayState({ sessionStatus: "SHORT_SESSION", anomaly: true, isAttributed: true }),
    "incomplete",
  );
  assert.equal(
    getSessionDisplayState({ sessionStatus: "NORMAL", durationSecs: 90, isAttributed: false, baseline: ESTABLISHED }),
    "unattributed",
  );
});

test("group severity selects the strongest existing state and defaults safely", () => {
  assert.equal(getMostSevereState(["normal", "incomplete", "watch"]), "watch");
  assert.equal(getMostSevereState(["watch", "abnormal", "normal"]), "abnormal");
  assert.equal(getMostSevereState(["insufficient", "normal"]), "normal");
  assert.equal(getMostSevereState([]), "insufficient");
});

test("the cat summary is raised by today's most severe session", () => {
  const watch = { state: "watch", provisional: false };
  const abnormal = { state: "abnormal", provisional: false };
  assert.deepEqual(
    summarizeCatBehavior({ sessionStates: [watch], hasCountedVisits: true, baseline: ESTABLISHED }),
    watch,
  );
  assert.deepEqual(
    summarizeCatBehavior({ sessionStates: [abnormal], hasCountedVisits: true, baseline: NOT_ESTABLISHED }),
    abnormal,
  );
});

test("Normal (provisional) is labeled as such; other states keep their labels", () => {
  assert.equal(getBehaviorStateLabel("normal", true), "Normal (provisional)");
  assert.equal(getBehaviorStateLabel("normal", false), "Normal");
  assert.equal(getBehaviorStateLabel("abnormal", true), "Abnormal");
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

test("a power-interrupted visit is incomplete regardless of its duration", () => {
  assert.equal(getSessionDisplayState({ sessionStatus: "SESSION_INTERRUPTED", durationSecs: 900, anomaly: true, isAttributed: true, baseline: ESTABLISHED }), "incomplete");
});

test("the behavior state key uses the brief's exact wording, with Normal (provisional) under Normal", () => {
  const { getBehaviorStateKeyEntries } = testModule.exports;
  const entries = getBehaviorStateKeyEntries(3).map(({ label, description }) => `${label}: ${description}`);
  assert.deepEqual(entries, [
    "Normal: within your cat's usual range",
    "Normal (provisional): within safe limits; your cat's own range is still being learned (3 of 7 days)",
    "Watch: above your cat's usual range",
    "Abnormal: a visit of 5 minutes or longer, or 7+ visits today",
    "Insufficient data: no visits recorded yet",
    "Incomplete: under 15 seconds, or the exit wasn't confirmed",
  ]);
  assert.ok(!entries.some((entry) => entry.startsWith("Unattributed")), "the dormant Unattributed state is not in the key");
});

test("the key without a single cat says how many days are needed", () => {
  const { getBehaviorStateKeyEntries } = testModule.exports;
  assert.equal(
    getBehaviorStateKeyEntries()[1].description,
    "within safe limits; your cat's own range is still being learned (needs 7 days with visits)",
  );
});

test("baseline progress reads X of 7 days and the update text matches the brief", () => {
  const { formatBaselineProgress, BASELINE_UPDATE_TEXT } = testModule.exports;
  assert.equal(formatBaselineProgress(0), "0 of 7 days");
  assert.equal(formatBaselineProgress(undefined), "0 of 7 days");
  assert.equal(formatBaselineProgress(4), "4 of 7 days");
  assert.equal(formatBaselineProgress(12), "7 of 7 days");
  assert.equal(BASELINE_UPDATE_TEXT, "Updated daily from this cat's last 14 days (median). Needs 7 days with visits.");
});

test("a state's wording can stand alone as a sentence", () => {
  const { getBehaviorStateSentence } = testModule.exports;
  assert.equal(getBehaviorStateSentence("watch"), "Above your cat's usual range.");
  assert.equal(
    getBehaviorStateSentence("normal", true, 2),
    "Within safe limits; your cat's own range is still being learned (2 of 7 days).",
  );
});
