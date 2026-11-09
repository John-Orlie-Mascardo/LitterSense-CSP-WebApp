/**
 * shortVisits.test.cjs
 *
 * The cat page History tab hides visits under 60 s by default (display only).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const output = ts.transpileModule(fs.readFileSync("lib/presentation/shortVisits.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const loaded = { exports: {} };
new Function("exports", "module", "require", output)(loaded.exports, loaded, (id) =>
  id === "@/lib/configs/behaviorThresholds" ? require("../configs/behaviorThresholds.ts") : require(id));
const { filterShortVisits, isShortVisit, SHOW_SHORT_VISITS_LABEL } = loaded.exports;

const rows = [
  { id: "a", durationSecs: 59, sessionStatus: "NORMAL" },
  { id: "b", durationSecs: 60, sessionStatus: "NORMAL" },
  { id: "c", durationSecs: 10, sessionStatus: "SHORT_SESSION" },
  { id: "d", durationSecs: 1, sessionStatus: "SESSION_INTERRUPTED" },
  { id: "e", durationSecs: 900, sessionStatus: "NO_EXIT_TIMEOUT" },
  { id: "f", durationSecs: 45, sessionStatus: "DAILY_SUMMARY" },
  { id: "g", durationSecs: 20, sessionStatus: "IN_PROGRESS" },
];

test("the toggle label matches the brief", () => {
  assert.equal(SHOW_SHORT_VISITS_LABEL, "Show short visits (under 1 min)");
});

test("visits under 60 s are hidden by default; 60 s and longer stay", () => {
  const { visible, hiddenCount } = filterShortVisits(rows, false);
  assert.deepEqual(visible.map((row) => row.id), ["b", "e", "f", "g"]);
  assert.equal(hiddenCount, 3);
});

test("turning the toggle on shows every visit", () => {
  const { visible, hiddenCount } = filterShortVisits(rows, true);
  assert.equal(visible.length, rows.length);
  assert.equal(hiddenCount, 0);
});

test("daily summaries and in-progress rows are never treated as short visits", () => {
  assert.equal(isShortVisit({ durationSecs: 45, sessionStatus: "DAILY_SUMMARY" }), false);
  assert.equal(isShortVisit({ durationSecs: 5, sessionStatus: "in_progress" }), false);
  assert.equal(isShortVisit({ durationSecs: 59.9, sessionStatus: null }), true);
});

test("the filter does not change the input list (hidden visits still count elsewhere)", () => {
  const copy = rows.slice();
  filterShortVisits(rows, false);
  assert.deepEqual(rows, copy);
});
