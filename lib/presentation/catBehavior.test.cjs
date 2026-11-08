/**
 * catBehavior.test.cjs
 *
 * End-to-end state tests through the real baseline builder (BASELINE_BRIEF Phase 3):
 * a cat moves Insufficient data → Normal (provisional) → Normal after 7 qualifying
 * days, and Normal → Watch on an above-range visit.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

function compile(path, resolve) {
  const output = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("exports", "module", "require", output)(loaded.exports, loaded, resolve);
  return loaded.exports;
}

const thresholds = compile("lib/configs/behaviorThresholds.ts", require);
const personalBaseline = compile("lib/utils/personalBaseline.ts", (id) =>
  id === "@/lib/configs/behaviorThresholds" ? thresholds : require(id));
const behaviorStates = compile("lib/presentation/behaviorStates.ts", () => thresholds);
const { buildCatBehaviorIndex, getCatBehaviorToday } = compile("lib/presentation/catBehavior.ts", (id) => {
  if (id === "@/lib/utils/personalBaseline") return personalBaseline;
  if (id === "@/lib/presentation/behaviorStates") return behaviorStates;
  return require(id);
});
const { getIndexedSessionBehavior } = behaviorStates;

// Nov 8, 2026 at 12:00 in Manila.
const NOW = new Date("2026-11-08T04:00:00.000Z");
const TODAY = "2026-11-08";
const PAST_WEEK = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"];

let nextId = 0;
const visit = (day, durationSecs, utcHour = 1, overrides = {}) => ({
  id: `visit-${++nextId}`,
  catId: "cat-1",
  date: day,
  endedAt: `${day}T${String(utcHour).padStart(2, "0")}:00:00.000Z`,
  durationSecs,
  sessionStatus: "NORMAL",
  anomaly: false,
  anomalyType: null,
  ...overrides,
});

// Two 90 s visits on each of the 7 days before today: median 2 visits / 90 s,
// MAD 0, so the upper limits are 3 visits and 120 s.
const establishedHistory = () => PAST_WEEK.flatMap((day) => [visit(day, 90, 1), visit(day, 90, 2)]);

const evaluate = (visits) => {
  const index = buildCatBehaviorIndex(visits, NOW);
  return {
    index,
    session: (row) => getIndexedSessionBehavior(row, index),
    cat: getCatBehaviorToday("cat-1", visits, index, NOW),
  };
};

test("(a) a new cat with zero visits is Insufficient data", () => {
  const { cat } = evaluate([]);
  assert.equal(cat.state, "insufficient");
  assert.equal(cat.provisional, false);
});

test("(b) day 1, a 90 s visit is Normal (provisional)", () => {
  const today = visit(TODAY, 90);
  const { session, cat } = evaluate([today]);
  assert.deepEqual(session(today), { state: "normal", provisional: true });
  assert.equal(cat.state, "normal");
  assert.equal(cat.provisional, true);
  assert.equal(cat.baseline.established, false);
});

test("(c) day 1, a 320 s visit is Abnormal", () => {
  const today = visit(TODAY, 320);
  const { session, cat } = evaluate([today]);
  assert.deepEqual(session(today), { state: "abnormal", provisional: false });
  assert.equal(cat.state, "abnormal");
});

test("(d) day 1, a 10 s visit is Incomplete and is not counted", () => {
  const today = visit(TODAY, 10);
  const { index, session } = evaluate([today]);
  assert.deepEqual(session(today), { state: "incomplete", provisional: false });
  assert.equal(index.catIdsWithCountedVisits.has("cat-1"), false);
  assert.equal(index.countedVisitsTodayBySessionId.has(today.id), false);
});

test("(e) after 7 qualifying days, the same 90 s visit is Normal with no provisional flag", () => {
  const today = visit(TODAY, 90);
  const { session, cat } = evaluate([...establishedHistory(), today]);
  assert.equal(cat.baseline.established, true);
  assert.equal(cat.baseline.daysUsed, 7);
  assert.deepEqual(session(today), { state: "normal", provisional: false });
  assert.deepEqual({ state: cat.state, provisional: cat.provisional }, { state: "normal", provisional: false });
});

test("a cat moves Insufficient data → Normal (provisional) → Normal as days qualify", () => {
  assert.equal(evaluate([]).cat.state, "insufficient");
  const sixDays = PAST_WEEK.slice(1).map((day) => visit(day, 90));
  assert.deepEqual(
    (({ state, provisional }) => ({ state, provisional }))(evaluate(sixDays).cat),
    { state: "normal", provisional: true },
  );
  const sevenDays = PAST_WEEK.map((day) => visit(day, 90));
  assert.deepEqual(
    (({ state, provisional }) => ({ state, provisional }))(evaluate(sevenDays).cat),
    { state: "normal", provisional: false },
  );
});

test("Normal → Watch on a visit above the cat's duration range", () => {
  const history = establishedHistory();
  const atLimit = visit(TODAY, 120);
  const above = visit(TODAY, 121, 3);
  const { session, cat } = evaluate([...history, atLimit, above]);
  assert.equal(session(atLimit).state, "normal");
  assert.equal(session(above).state, "watch");
  assert.equal(cat.state, "watch");
});

test("Normal → Watch when today's counted visits pass the visit range, Abnormal on the 7th", () => {
  const history = establishedHistory();
  // Listed out of order on purpose: the count follows visit time, not input order.
  const todayVisits = [7, 1, 3, 2, 6, 4, 5].map((hour) => visit(TODAY, 90, hour, { id: `today-${hour}` }));
  const { session } = evaluate([...history, ...todayVisits]);
  const stateAt = (hour) => session(todayVisits.find((row) => row.id === `today-${hour}`)).state;
  assert.equal(stateAt(3), "normal");
  assert.equal(stateAt(4), "watch");
  assert.equal(stateAt(6), "watch");
  assert.equal(stateAt(7), "abnormal");
});

test("visits under 15 s and timeouts do not count toward the same-day visit number", () => {
  const counted = [1, 2, 3, 4, 5, 6].map((hour) => visit(TODAY, 90, hour));
  const notCounted = [
    visit(TODAY, 10, 7),
    visit(TODAY, 14.99, 7),
    visit(TODAY, 90, 7, { sessionStatus: "NO_EXIT_TIMEOUT" }),
    visit(TODAY, 90, 7, { sessionStatus: "SHORT_SESSION" }),
  ];
  const sixth = counted.at(-1);
  const { index, session, cat } = evaluate([...counted, ...notCounted]);
  assert.equal(index.countedVisitsTodayBySessionId.get(sixth.id), 6);
  assert.equal(session(sixth).state, "normal");
  for (const row of notCounted) assert.equal(index.countedVisitsTodayBySessionId.has(row.id), false);
  assert.notEqual(cat.state, "abnormal");
  // The next counted visit is the 7th.
  const seventh = visit(TODAY, 90, 8);
  assert.equal(evaluate([...counted, ...notCounted, seventh]).session(seventh).state, "abnormal");
});

test("Watch is never provisional: the same above-range visit without a baseline is Normal (provisional)", () => {
  const today = visit(TODAY, 200);
  const { session } = evaluate([...PAST_WEEK.slice(1).map((day) => visit(day, 90)), today]);
  assert.deepEqual(session(today), { state: "normal", provisional: true });
});
