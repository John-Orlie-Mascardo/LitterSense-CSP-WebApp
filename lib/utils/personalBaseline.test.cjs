const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

function compileTypeScriptModule(path, resolveModule = require) {
  const source = fs.readFileSync(path, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const loaded = { exports: {} };
  const loadModule = new Function("exports", "module", "require", compiled.outputText);
  loadModule(loaded.exports, loaded, resolveModule);
  return loaded.exports;
}

const thresholds = compileTypeScriptModule("lib/configs/behaviorThresholds.ts");
const { buildPersonalBaseline } = compileTypeScriptModule(
  "lib/utils/personalBaseline.ts",
  (id) => id === "@/lib/configs/behaviorThresholds" ? thresholds : require(id),
);

const NOW = new Date("2026-11-08T04:00:00.000Z");
const SEVEN_DAYS = [
  "2026-11-01",
  "2026-11-02",
  "2026-11-03",
  "2026-11-04",
  "2026-11-05",
  "2026-11-06",
  "2026-11-07",
];

function visit(day, overrides = {}) {
  return {
    catId: "cat-1",
    date: day,
    endedAt: `${day}T04:00:00.000Z`,
    durationSecs: 60,
    sessionStatus: "NORMAL",
    ...overrides,
  };
}

test("six qualifying days do not establish a baseline", () => {
  const result = buildPersonalBaseline(SEVEN_DAYS.slice(1).map((day) => visit(day)), NOW);

  assert.equal(result.established, false);
  assert.equal(result.daysUsed, 6);
  assert.equal(result.windowStart, "2026-10-25");
  assert.equal(result.windowEnd, "2026-11-07");
  assert.equal(result.medianVisitsPerDay, null);
  assert.equal(result.medianDurationSecs, null);
  assert.equal(result.visitBand, null);
  assert.equal(result.durationBand, null);
});

test("seven qualifying days establish a baseline", () => {
  const result = buildPersonalBaseline(SEVEN_DAYS.map((day) => visit(day)), NOW);

  assert.equal(result.established, true);
  assert.equal(result.daysUsed, 7);
  assert.equal(result.medianVisitsPerDay, 1);
  assert.equal(result.medianDurationSecs, 60);
});

test("today's visits are outside the baseline window", () => {
  const visits = [
    ...SEVEN_DAYS.slice(1).map((day) => visit(day)),
    visit("2026-11-08"),
  ];
  const result = buildPersonalBaseline(visits, NOW);

  assert.equal(result.established, false);
  assert.equal(result.daysUsed, 6);
});

test("a day containing an ABNORMAL status or 300-second visit is excluded", () => {
  const statusVisits = SEVEN_DAYS.map((day) => visit(day));
  statusVisits.push(visit("2026-11-07", {
    endedAt: "2026-11-07T05:00:00.000Z",
    durationSecs: 60,
    sessionStatus: "ABNORMAL",
  }));
  const statusResult = buildPersonalBaseline(statusVisits, NOW);
  const durationResult = buildPersonalBaseline(
    SEVEN_DAYS.map((day) => visit(day, day === "2026-11-07" ? { durationSecs: 300 } : {})),
    NOW,
  );

  assert.equal(statusResult.established, false);
  assert.equal(statusResult.daysUsed, 6);
  assert.equal(durationResult.established, false);
  assert.equal(durationResult.daysUsed, 6);
});

test("sub-15-second, timeout, interrupted, false-entry, and unattributed visits do not count", () => {
  const candidateDay = "2026-11-01";
  const visits = [
    ...SEVEN_DAYS.slice(1).map((day) => visit(day)),
    visit(candidateDay, { durationSecs: 14 }),
    visit(candidateDay, { durationSecs: 60, sessionStatus: "SHORT_SESSION" }),
    visit(candidateDay, { durationSecs: 60, sessionStatus: "NO_EXIT_TIMEOUT" }),
    visit(candidateDay, { durationSecs: 60, sessionStatus: "SESSION_INTERRUPTED" }),
    visit(candidateDay, { durationSecs: 60, sessionStatus: "FALSE_ENTRY_IGNORED" }),
    visit(candidateDay, { catId: "   " }),
  ];
  const result = buildPersonalBaseline(visits, NOW);

  assert.equal(result.established, false);
  assert.equal(result.daysUsed, 6);
});

test("two daily visits with zero MAD produce a visit upper limit of three", () => {
  const visits = SEVEN_DAYS.flatMap((day) => [
    visit(day),
    visit(day, { endedAt: `${day}T05:00:00.000Z` }),
  ]);
  const result = buildPersonalBaseline(visits, NOW);

  assert.equal(result.medianVisitsPerDay, 2);
  assert.deepEqual(result.visitBand, [1, 3]);
  assert.equal(3 > result.visitBand[1], false);
  assert.equal(4 > result.visitBand[1], true);
});

test("23:59 and 00:01 Manila timestamps land on different calendar days", () => {
  const boundaryNow = new Date("2026-11-09T04:00:00.000Z");
  const visits = [
    ...["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]
      .map((day) => visit(day)),
    visit("2026-11-07", { endedAt: "2026-11-07T15:59:00.000Z" }),
    visit("2026-11-07", { endedAt: "2026-11-07T16:01:00.000Z" }),
  ];
  const result = buildPersonalBaseline(visits, boundaryNow);

  assert.equal(result.established, true);
  assert.equal(result.daysUsed, 7);
  assert.equal(result.medianVisitsPerDay, 1);
});

test("identical 60-second durations with zero MAD produce a 90-second upper limit", () => {
  const result = buildPersonalBaseline(SEVEN_DAYS.map((day) => visit(day)), NOW);

  assert.equal(result.medianDurationSecs, 60);
  assert.deepEqual(result.durationBand, [30, 90]);
});
