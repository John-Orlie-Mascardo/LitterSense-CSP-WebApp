/**
 * sessionNormalization.test.cjs
 *
 * Parity tests for the shared Firestore session adapter.
 *
 * DONE: timestamps, inferred entry, dates, numeric defaults, anomaly and status fields
 * PLACEHOLDER: none
 *
 * NEXT: add fixtures when firmware persists a new session field.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/utils/sessionNormalization.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});
const testModule = { exports: {} };
const loadModule = new Function("exports", "module", "require", compiled.outputText);
loadModule(testModule.exports, testModule, (id) => {
  if (id === "@/lib/utils/sessionDate") return require("./sessionDate.ts");
  return require(id);
});

const { normalizeSessionDocument } = testModule.exports;

test("normalizes the existing Firestore session shape", () => {
  const session = normalizeSessionDocument("session-1", {
    catId: "cat-1",
    date: "2026-08-28",
    endedAt: "2026-08-28T05:00:00.000Z",
    durationSecs: 125,
    mq135Delta: 6,
    mq136Delta: 3,
    anomaly: true,
    anomalyType: "Extended duration",
    sessionStatus: "ABNORMAL",
  });

  assert.equal(session.id, "session-1");
  assert.equal(session.catId, "cat-1");
  assert.equal(session.endedAt, "2026-08-28T05:00:00.000Z");
  assert.equal(session.startedAt, "2026-08-28T04:57:55.000Z");
  assert.equal(session.durationSecs, 125);
  assert.equal(session.mq135Delta, 6);
  assert.equal(session.mq136Delta, 3);
  assert.equal(session.anomaly, true);
  assert.equal(session.anomalyType, "Extended duration");
  assert.equal(session.sessionStatus, "ABNORMAL");
});

test("keeps current defaults for missing optional values", () => {
  const session = normalizeSessionDocument("session-2", {
    catId: "cat-2",
    createdAt: "2026-08-28T05:00:00.000Z",
  });

  assert.equal(session.durationSecs, 0);
  assert.equal(session.mq135Delta, 0);
  assert.equal(session.mq136Delta, 0);
  assert.equal(session.anomaly, false);
  assert.equal(session.anomalyType, null);
  assert.equal(session.sessionStatus, "NORMAL");
});
