/**
 * reportSessionGroups.test.cjs
 *
 * Behavioral tests for grouping existing report sessions by cat.
 *
 * DONE: named ordering, Unattributed placement, counts, baseline gating, severity
 * PLACEHOLDER: none
 *
 * NEXT: add fixtures only when the persisted report schema gains a real field.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

function compile(file, requireFn = require) {
  const source = fs.readFileSync(file, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const testModule = { exports: {} };
  new Function("exports", "module", "require", output)(
    testModule.exports,
    testModule,
    requireFn,
  );
  return testModule.exports;
}

const behaviorStates = compile("lib/presentation/behaviorStates.ts");
const groupsModule = compile(
  "lib/presentation/reportSessionGroups.ts",
  (request) => request === "./behaviorStates" ? behaviorStates : require(request),
);
const { buildReportSessionGroups, UNATTRIBUTED_GROUP_NAME } = groupsModule;

const session = (overrides = {}) => ({
  id: "session-1",
  catId: "cat-1",
  catName: "Milo",
  durationSecs: 90,
  mq135Delta: 2,
  mq136Delta: 1,
  anomaly: false,
  anomalyType: null,
  sessionStatus: "NORMAL",
  ...overrides,
});

test("a cat with no sessions or baseline is grouped as Insufficient data", () => {
  const groups = buildReportSessionGroups([], [
    { id: "cat-1", name: "Milo", avatar: null, baselineEstablished: false },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].sessionCount, 0);
  assert.equal(groups[0].state, "insufficient");
  assert.deepEqual(groups[0].sessions, []);
});

test("normal is shown only when the cat has an established baseline", () => {
  const noBaseline = buildReportSessionGroups([session()], [
    { id: "cat-1", name: "Milo", baselineEstablished: false },
  ]);
  const withBaseline = buildReportSessionGroups([session()], [
    { id: "cat-1", name: "Milo", baselineEstablished: true },
  ]);

  assert.equal(noBaseline[0].state, "insufficient");
  assert.equal(withBaseline[0].state, "normal");
});

test("a named group uses the most severe real session state and visit count", () => {
  const groups = buildReportSessionGroups([
    session({ id: "normal", summaryVisits: 3 }),
    session({ id: "abnormal", anomaly: true, sessionStatus: "ABNORMAL" }),
  ], [
    { id: "cat-1", name: "Milo", baselineEstablished: true },
  ]);

  assert.equal(groups[0].sessionCount, 4);
  assert.equal(groups[0].state, "abnormal");
  assert.equal(groups[0].sessions.length, 2);
});

test("unattributed sessions form one explanatory group after every named cat", () => {
  const groups = buildReportSessionGroups([
    session(),
    session({
      id: "unmatched",
      catId: "",
      catName: UNATTRIBUTED_GROUP_NAME,
    }),
  ], [
    { id: "cat-1", name: "Milo", baselineEstablished: true },
    { id: "cat-2", name: "Luna", baselineEstablished: false },
  ]);

  assert.deepEqual(groups.map((group) => group.name), [
    "Milo",
    "Luna",
    UNATTRIBUTED_GROUP_NAME,
  ]);
  assert.equal(groups.at(-1).state, "unattributed");
  assert.equal(
    groups.at(-1).description,
    "Litter box use was detected but no collar tag was read.",
  );
});
