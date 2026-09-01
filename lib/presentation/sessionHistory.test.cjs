/**
 * sessionHistory.test.cjs
 *
 * Pure behavior tests for Session History filters, states, sorting, and grouping.
 *
 * DONE: defaults, URL parsing, inclusive ranges, Unattributed, six states, order
 * PLACEHOLDER: none
 *
 * NEXT: add a fixture whenever a new upstream session status is introduced.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/presentation/sessionHistory.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});
const testModule = { exports: {} };
const loadModule = new Function("exports", "module", "require", compiled.outputText);
loadModule(testModule.exports, testModule, (id) => {
  if (id === "@/lib/presentation/behaviorStates") return require("./behaviorStates.ts");
  if (id === "@/lib/utils/sessionDate") return require("../utils/sessionDate.ts");
  if (id === "@/lib/utils/sessionTime") return require("../utils/sessionTime.ts");
  return require(id);
});

const {
  filterAndSortHistorySessions,
  getDefaultHistoryFilters,
  getHistorySessionState,
  groupHistorySessions,
  parseHistoryFilters,
  selectCalendarDate,
  serializeHistoryFilters,
} = testModule.exports;

const session = (overrides = {}) => ({
  id: "session-1",
  catId: "cat-1",
  date: "2026-08-28",
  time: "1:00 PM",
  endedAt: "2026-08-28T05:00:00.000Z",
  durationSecs: 120,
  mq135Delta: 4,
  mq136Delta: 2,
  anomaly: false,
  anomalyType: null,
  sessionStatus: "NORMAL",
  ...overrides,
});

test("defaults to the last 30 days, all cats, all six states, newest first", () => {
  const filters = getDefaultHistoryFilters(new Date(2026, 7, 30));
  assert.equal(filters.startDate, "2026-08-01");
  assert.equal(filters.endDate, "2026-08-30");
  assert.equal(filters.catId, "all");
  assert.equal(filters.states.length, 6);
  assert.equal(filters.sort, "desc");
});

test("round-trips valid URL filters and rejects stale cat IDs", () => {
  const filters = parseHistoryFilters(
    new URLSearchParams("start=2026-08-03&end=2026-08-27&preset=custom&cat=cat-1&states=watch,abnormal&sort=asc"),
    ["cat-1"],
    new Date(2026, 7, 30),
  );
  assert.equal(filters.catId, "cat-1");
  assert.deepEqual(filters.states, ["watch", "abnormal"]);
  assert.equal(serializeHistoryFilters(filters).get("start"), "2026-08-03");

  const stale = parseHistoryFilters(
    new URLSearchParams("cat=removed-cat"),
    ["cat-1"],
    new Date(2026, 7, 30),
  );
  assert.equal(stale.catId, "all");
});

test("calendar selection emphasizes a start then an inclusive end", () => {
  assert.deepEqual(selectCalendarDate(null, null, "2026-08-03"), {
    startDate: "2026-08-03",
    endDate: null,
  });
  assert.deepEqual(selectCalendarDate("2026-08-03", null, "2026-08-27"), {
    startDate: "2026-08-03",
    endDate: "2026-08-27",
  });
  assert.deepEqual(selectCalendarDate("2026-08-03", null, "2026-08-01"), {
    startDate: "2026-08-01",
    endDate: null,
  });
});

test("filters inclusive endpoints, Unattributed, multiple states, and order", () => {
  const catIds = new Set(["cat-1"]);
  const baselines = new Set(["cat-1"]);
  const rows = [
    session({ id: "normal", date: "2026-08-03", endedAt: "2026-08-03T05:00:00.000Z" }),
    session({ id: "abnormal", date: "2026-08-27", endedAt: "2026-08-27T05:00:00.000Z", anomaly: true }),
    session({ id: "unknown", catId: "missing", date: "2026-08-20", endedAt: "2026-08-20T05:00:00.000Z" }),
  ];
  const filters = {
    startDate: "2026-08-03",
    endDate: "2026-08-27",
    preset: "custom",
    catId: "all",
    states: ["normal", "abnormal", "unattributed"],
    sort: "desc",
  };

  assert.deepEqual(
    filterAndSortHistorySessions(rows, filters, catIds, baselines).map((row) => row.id),
    ["abnormal", "unknown", "normal"],
  );
  assert.equal(getHistorySessionState(rows[2], catIds, baselines), "unattributed");
});

test("groups sessions under full owner-facing dates", () => {
  const groups = groupHistorySessions([session(), session({ id: "session-2" })]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].dateLabel, "August 28, 2026");
  assert.equal(groups[0].sessions.length, 2);
});
